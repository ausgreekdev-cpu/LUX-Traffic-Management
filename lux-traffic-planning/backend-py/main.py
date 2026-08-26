"""
TMP Dashboard — FastAPI Application

Endpoints:
  /api/health                              Health check
  /api/clients                             Client CRUD
  /api/tmps                                TMP CRUD + advance + status
  /api/tmps/{id}/planners                  Planner tracking
  /api/file-approvals                      File approval queue CRUD
  /api/file-approvals/{id}/route           AI routing
  /api/invoices                            Invoice CRUD + generate
"""

import uuid
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import selectinload

from models import (
    Base,
    Client,
    TMP,
    TMPType,
    TMPStatus,
    FileApprovalQueue,
    ApprovalStatus,
    Invoice,
    InvoiceStatus,
    HOURS_ALLOCATION,
    SLA_WAIT_DAYS,
    STATUS_TRANSITIONS,
)
from agent import route_incoming_document, FileRoutingDecision
from workflows import (
    create_tmp_base,
    trigger_approval_workflow,
    advance_status,
    track_planner_interaction,
    build_invoice_base,
    calculate_invoice_totals,
    is_valid_transition,
)

# ── Config ─────────────────────────────────────────────────────────────────

DATABASE_URL: str = "sqlite+aiosqlite:///./tmp_dashboard.db"
# For PostgreSQL use:
# DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost:5432/tmp_dashboard")

engine = create_async_engine(DATABASE_URL, echo=False)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

logger = logging.getLogger(__name__)


# ── Lifespan ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ready")
    yield


# ── App ────────────────────────────────────────────────────────────────────

app = FastAPI(title="TMP Dashboard API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Dependency ─────────────────────────────────────────────────────────────

async def get_db() -> AsyncSession:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── Pydantic Schemas ───────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    app: str
    version: str


class ClientCreate(BaseModel):
    name: str
    contact_details: str | None = None

class ClientUpdate(BaseModel):
    name: str | None = None
    contact_details: str | None = None

class ClientOut(BaseModel):
    id: uuid.UUID
    name: str
    contact_details: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TMPCreate(BaseModel):
    client_id: uuid.UUID
    type: TMPType = TMPType.BASIC
    description: str | None = None
    location: str | None = None
    planners: list[str] | None = None

class TMPUpdate(BaseModel):
    type: TMPType | None = None
    description: str | None = None
    location: str | None = None
    lga_fee: float | None = None
    rtm_fee: float | None = None
    hours_tracked: float | None = None

class TMPStatusUpdate(BaseModel):
    status: TMPStatus

class TMPApprovalTrigger(BaseModel):
    approval_type: str = Field(
        description="One of: LGA, MRWA_RPL, HVS, PTA, CLIENT_REVIEW"
    )

class TMPPlannerAdd(BaseModel):
    planner_id: str

class TMPOut(BaseModel):
    id: uuid.UUID
    tmp_number: str
    client_id: uuid.UUID
    type: TMPType
    allocated_hours: int
    hours_tracked: float
    status: TMPStatus
    lga_fee: float | None
    rtm_fee: float | None
    planners_involved: list
    description: str | None
    location: str | None
    sla_deadlines: dict | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FileApprovalCreate(BaseModel):
    tmp_id: uuid.UUID | None = None
    file_url: str
    file_type: str | None = None
    summary: str | None = None
    owner: str | None = None
    destination_module: str | None = None

class FileApprovalUpdate(BaseModel):
    approval_status: ApprovalStatus | None = None

class FileApprovalRouteText(BaseModel):
    document_text: str
    tmp_id: uuid.UUID | None = None

class FileApprovalOut(BaseModel):
    id: uuid.UUID
    tmp_id: uuid.UUID | None
    file_url: str
    file_type: str | None
    summary: str | None
    owner: str | None
    destination_module: str | None
    confidence_score: float | None
    approval_status: ApprovalStatus
    ai_analysis: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class InvoiceCreate(BaseModel):
    client_id: uuid.UUID
    tmp_id: uuid.UUID
    hourly_rate: float = 150.0

class InvoiceUpdate(BaseModel):
    status: InvoiceStatus | None = None
    lga_fee: float | None = None
    rtm_fee: float | None = None
    hours_tracked: float | None = None
    hourly_rate: float | None = None

class InvoiceOut(BaseModel):
    id: uuid.UUID
    invoice_number: str
    client_id: uuid.UUID
    tmp_id: uuid.UUID | None
    lga_fee: float
    rtm_fee: float
    hours_tracked: float
    hourly_rate: float
    labour_cost: float
    total_amount: float
    status: InvoiceStatus
    due_date: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Health ─────────────────────────────────────────────────────────────────

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(status="healthy", app="TMP Dashboard API", version="1.0.0")


# ══════════════════════════════════════════════════════════════════════════
# CLIENTS
# ══════════════════════════════════════════════════════════════════════════

@app.get("/api/clients", response_model=list[ClientOut])
async def list_clients(
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    q = select(Client)
    if search:
        q = q.where(Client.name.ilike(f"%{search}%"))
    q = q.order_by(Client.name).offset(skip).limit(limit)
    result = await db.execute(q)
    return list(result.scalars().all())


@app.get("/api/clients/{client_id}", response_model=ClientOut)
async def get_client(client_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Client).where(Client.id == client_id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Client not found")
    return c


@app.post("/api/clients", response_model=ClientOut, status_code=201)
async def create_client(data: ClientCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Client).where(Client.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Client already exists")
    client = Client(name=data.name, contact_details=data.contact_details)
    db.add(client)
    await db.flush()
    await db.refresh(client)
    return client


@app.put("/api/clients/{client_id}", response_model=ClientOut)
async def update_client(client_id: uuid.UUID, data: ClientUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(404, "Client not found")
    if data.name is not None:
        client.name = data.name
    if data.contact_details is not None:
        client.contact_details = data.contact_details
    await db.flush()
    await db.refresh(client)
    return client


@app.delete("/api/clients/{client_id}", status_code=204)
async def delete_client(client_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(404, "Client not found")
    await db.delete(client)
    await db.flush()


# ══════════════════════════════════════════════════════════════════════════
# TMPs
# ══════════════════════════════════════════════════════════════════════════

def _generate_tmp_number(status: TMPStatus, count: int) -> str:
    year = datetime.now().year
    prefix = status.value.upper().replace("-", "_")[:3]
    return f"TMP-{year}-{prefix}-{count + 1:04d}"


@app.get("/api/tmps", response_model=list[TMPOut])
async def list_tmps(
    status: TMPStatus | None = None,
    client_id: uuid.UUID | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    q = select(TMP).options(selectinload(TMP.client))
    if status:
        q = q.where(TMP.status == status)
    if client_id:
        q = q.where(TMP.client_id == client_id)
    if search:
        like = f"%{search}%"
        q = q.where(
            TMP.tmp_number.ilike(like) |
            TMP.description.ilike(like) |
            TMP.location.ilike(like)
        )
    q = q.order_by(TMP.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(q)
    return list(result.scalars().all())


@app.get("/api/tmps/{tmp_id}", response_model=TMPOut)
async def get_tmp(tmp_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TMP).options(selectinload(TMP.client)).where(TMP.id == tmp_id)
    )
    tmp = result.scalar_one_or_none()
    if not tmp:
        raise HTTPException(404, "TMP not found")
    return tmp


@app.post("/api/tmps", response_model=TMPOut, status_code=201)
async def create_tmp(data: TMPCreate, db: AsyncSession = Depends(get_db)):
    # Validate client exists
    c_result = await db.execute(select(Client).where(Client.id == data.client_id))
    if not c_result.scalar_one_or_none():
        raise HTTPException(404, "Client not found")

    # Count existing TMPs for number generation
    count_result = await db.execute(select(func.count(TMP.id)))
    total = count_result.scalar() or 0

    # Auto-assign hours based on type
    base_hours = HOURS_ALLOCATION[data.type]

    tmp = TMP(
        client_id=data.client_id,
        type=data.type,
        allocated_hours=base_hours,
        hours_tracked=0.0,
        status=TMPStatus.DRAFT,
        planners_involved=data.planners or [],
        description=data.description or "",
        location=data.location or "",
        tmp_number=_generate_tmp_number(TMPStatus.DRAFT, total),
    )
    db.add(tmp)
    await db.flush()
    await db.refresh(tmp)
    return tmp


@app.put("/api/tmps/{tmp_id}", response_model=TMPOut)
async def update_tmp(tmp_id: uuid.UUID, data: TMPUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TMP).options(selectinload(TMP.client)).where(TMP.id == tmp_id)
    )
    tmp = result.scalar_one_or_none()
    if not tmp:
        raise HTTPException(404, "TMP not found")

    update_map = data.model_dump(exclude_unset=True)
    for field, value in update_map.items():
        setattr(tmp, field, value)

    await db.flush()
    await db.refresh(tmp)
    return tmp


@app.delete("/api/tmps/{tmp_id}", status_code=204)
async def delete_tmp(tmp_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TMP).where(TMP.id == tmp_id))
    tmp = result.scalar_one_or_none()
    if not tmp:
        raise HTTPException(404, "TMP not found")
    await db.delete(tmp)
    await db.flush()


# ── TMP Status / Workflow ──────────────────────────────────────────────────

@app.put("/api/tmps/{tmp_id}/status", response_model=TMPOut)
async def update_tmp_status(
    tmp_id: uuid.UUID,
    data: TMPStatusUpdate,
    planner_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Advance a TMP to a specific status (validated by state machine)."""
    result = await db.execute(
        select(TMP).options(selectinload(TMP.client)).where(TMP.id == tmp_id)
    )
    tmp = result.scalar_one_or_none()
    if not tmp:
        raise HTTPException(404, "TMP not found")

    if not is_valid_transition(tmp.status, data.status):
        raise HTTPException(
            400,
            f"Invalid transition: {tmp.status.value} -> {data.status.value}",
        )

    tmp.status = data.status

    # Track planner interaction if ID supplied
    if planner_id:
        planners = list(tmp.planners_involved or [])
        if planner_id not in planners:
            planners.append(planner_id)
        tmp.planners_involved = planners

    await db.flush()
    await db.refresh(tmp)
    return tmp


@app.put("/api/tmps/{tmp_id}/approval", response_model=TMPOut)
async def trigger_tmp_approval(
    tmp_id: uuid.UUID,
    data: TMPApprovalTrigger,
    planner_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Trigger an SLA-based approval workflow (sets a 10-day deadline)."""
    result = await db.execute(
        select(TMP).options(selectinload(TMP.client)).where(TMP.id == tmp_id)
    )
    tmp = result.scalar_one_or_none()
    if not tmp:
        raise HTTPException(404, "TMP not found")

    # Convert ORM object to dict for the workflow function
    tmp_dict = {
        "status": tmp.status.value,
        "sla_deadlines": dict(tmp.sla_deadlines or {}),
    }

    try:
        tmp_dict = trigger_approval_workflow(tmp_dict, data.approval_type)
    except ValueError as e:
        raise HTTPException(400, str(e))

    tmp.status = TMPStatus(tmp_dict["status"])
    tmp.sla_deadlines = tmp_dict["sla_deadlines"]

    # Track planner
    if planner_id:
        planners = list(tmp.planners_involved or [])
        if planner_id not in planners:
            planners.append(planner_id)
        tmp.planners_involved = planners

    await db.flush()
    await db.refresh(tmp)
    return tmp


# ── Planner Tracking ───────────────────────────────────────────────────────

@app.post("/api/tmps/{tmp_id}/planners", response_model=TMPOut)
async def add_planner_to_tmp(
    tmp_id: uuid.UUID,
    data: TMPPlannerAdd,
    db: AsyncSession = Depends(get_db),
):
    """Register a planner interaction with a TMP."""
    result = await db.execute(
        select(TMP).options(selectinload(TMP.client)).where(TMP.id == tmp_id)
    )
    tmp = result.scalar_one_or_none()
    if not tmp:
        raise HTTPException(404, "TMP not found")

    planners = list(tmp.planners_involved or [])
    if data.planner_id not in planners:
        planners.append(data.planner_id)
    tmp.planners_involved = planners

    await db.flush()
    await db.refresh(tmp)
    return tmp


# ══════════════════════════════════════════════════════════════════════════
# FILE APPROVAL QUEUE
# ══════════════════════════════════════════════════════════════════════════

@app.get("/api/file-approvals", response_model=list[FileApprovalOut])
async def list_file_approvals(
    status: ApprovalStatus | None = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    q = select(FileApprovalQueue).options(selectinload(FileApprovalQueue.tmp))
    if status:
        q = q.where(FileApprovalQueue.approval_status == status)
    q = q.order_by(FileApprovalQueue.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(q)
    return list(result.scalars().all())


@app.get("/api/file-approvals/{file_id}", response_model=FileApprovalOut)
async def get_file_approval(file_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(FileApprovalQueue)
        .options(selectinload(FileApprovalQueue.tmp))
        .where(FileApprovalQueue.id == file_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "File approval entry not found")
    return entry


@app.post("/api/file-approvals", response_model=FileApprovalOut, status_code=201)
async def create_file_approval(data: FileApprovalCreate, db: AsyncSession = Depends(get_db)):
    entry = FileApprovalQueue(
        tmp_id=data.tmp_id,
        file_url=data.file_url,
        file_type=data.file_type,
        summary=data.summary,
        owner=data.owner,
        destination_module=data.destination_module,
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return entry


@app.post("/api/file-approvals/route-text", response_model=FileApprovalOut, status_code=201)
async def route_document_text(
    data: FileApprovalRouteText,
    db: AsyncSession = Depends(get_db),
):
    """Accept raw document text, run the AI routing agent, and enqueue for approval."""
    decision: FileRoutingDecision = route_incoming_document(data.document_text)

    entry = FileApprovalQueue(
        tmp_id=data.tmp_id,
        file_url="",
        file_type=decision.file_type,
        summary=decision.summary,
        owner=decision.owner,
        destination_module=decision.destination_module,
        confidence_score=decision.confidence_score,
        approval_status=ApprovalStatus.PENDING,
        ai_analysis=(
            f"Type: {decision.file_type}\n"
            f"Summary: {decision.summary}\n"
            f"Owner: {decision.owner}\n"
            f"Destination: {decision.destination_module}\n"
            f"Confidence: {decision.confidence_score:.2f}"
        ),
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return entry


@app.put("/api/file-approvals/{file_id}", response_model=FileApprovalOut)
async def update_file_approval(
    file_id: uuid.UUID,
    data: FileApprovalUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FileApprovalQueue)
        .options(selectinload(FileApprovalQueue.tmp))
        .where(FileApprovalQueue.id == file_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "File approval entry not found")
    if data.approval_status is not None:
        entry.approval_status = data.approval_status
    await db.flush()
    await db.refresh(entry)
    return entry


@app.delete("/api/file-approvals/{file_id}", status_code=204)
async def delete_file_approval(file_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FileApprovalQueue).where(FileApprovalQueue.id == file_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "File approval entry not found")
    await db.delete(entry)
    await db.flush()


# ══════════════════════════════════════════════════════════════════════════
# INVOICES
# ══════════════════════════════════════════════════════════════════════════

@app.get("/api/invoices", response_model=list[InvoiceOut])
async def list_invoices(
    status: InvoiceStatus | None = None,
    client_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    q = select(Invoice).options(selectinload(Invoice.client), selectinload(Invoice.tmp))
    if status:
        q = q.where(Invoice.status == status)
    if client_id:
        q = q.where(Invoice.client_id == client_id)
    q = q.order_by(Invoice.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(q)
    return list(result.scalars().all())


@app.get("/api/invoices/{invoice_id}", response_model=InvoiceOut)
async def get_invoice(invoice_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.client), selectinload(Invoice.tmp))
        .where(Invoice.id == invoice_id)
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return inv


@app.post("/api/invoices/generate", response_model=InvoiceOut, status_code=201)
async def generate_invoice(data: InvoiceCreate, db: AsyncSession = Depends(get_db)):
    """Auto-generate an invoice from client and TMP data."""
    # Fetch client
    c_result = await db.execute(select(Client).where(Client.id == data.client_id))
    client = c_result.scalar_one_or_none()
    if not client:
        raise HTTPException(404, "Client not found")

    # Fetch TMP
    t_result = await db.execute(
        select(TMP).options(selectinload(TMP.client)).where(TMP.id == data.tmp_id)
    )
    tmp = t_result.scalar_one_or_none()
    if not tmp:
        raise HTTPException(404, "TMP not found")

    # Build invoice data using the workflows service
    client_dict = {"id": str(client.id), "name": client.name}
    tmp_dict = {
        "id": str(tmp.id),
        "tmp_number": tmp.tmp_number,
        "lga_fee": float(tmp.lga_fee or 0),
        "rtm_fee": float(tmp.rtm_fee or 0),
        "hours_tracked": float(tmp.hours_tracked or 0),
    }

    invoice_data = build_invoice_base(client_dict, tmp_dict, hourly_rate=data.hourly_rate)

    # Count existing for invoice number
    count_result = await db.execute(select(func.count(Invoice.id)))
    total = count_result.scalar() or 0

    invoice = Invoice(
        client_id=data.client_id,
        tmp_id=data.tmp_id,
        lga_fee=invoice_data["lga_fee"],
        rtm_fee=invoice_data["rtm_fee"],
        hours_tracked=invoice_data["hours_tracked"],
        hourly_rate=invoice_data["hourly_rate"],
        labour_cost=invoice_data["labour_cost"],
        total_amount=invoice_data["total_amount"],
        status=InvoiceStatus.DRAFT,
        invoice_number=f"INV-{total + 1:05d}",
    )
    db.add(invoice)
    await db.flush()
    await db.refresh(invoice)
    return invoice


@app.put("/api/invoices/{invoice_id}", response_model=InvoiceOut)
async def update_invoice(
    invoice_id: uuid.UUID,
    data: InvoiceUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.client), selectinload(Invoice.tmp))
        .where(Invoice.id == invoice_id)
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(404, "Invoice not found")

    update_map = data.model_dump(exclude_unset=True)
    for field, value in update_map.items():
        setattr(inv, field, value)

    # Recalculate totals if fee/hours changed
    totals = calculate_invoice_totals(
        lga_fee=inv.lga_fee,
        rtm_fee=inv.rtm_fee,
        hours_tracked=inv.hours_tracked or 0,
        hourly_rate=inv.hourly_rate,
    )
    inv.labour_cost = totals["labour_cost"]
    inv.total_amount = totals["total_amount"]

    await db.flush()
    await db.refresh(inv)
    return inv


@app.delete("/api/invoices/{invoice_id}", status_code=204)
async def delete_invoice(invoice_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    await db.delete(inv)
    await db.flush()
