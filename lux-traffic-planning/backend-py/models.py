import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    String, Integer, Float, Enum, DateTime, ForeignKey, Text, JSON, func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# ── Enums ──────────────────────────────────────────────────────────────────

class TMPType(str, PyEnum):
    BASIC = "basic"
    DETAILED = "detailed"
    COMPLEX = "complex"
    REVISION = "revision"


class TMPStatus(str, PyEnum):
    DRAFT = "draft"
    PENDING_LGA = "pending_lga"
    PENDING_MRWA_RPL = "pending_mrwa_rpl"
    PENDING_HVS = "pending_hvs"
    PENDING_PTA = "pending_pta"
    PENDING_CLIENT_REVIEW = "pending_client_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    COMPLETED = "completed"


class ApprovalStatus(str, PyEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class InvoiceStatus(str, PyEnum):
    DRAFT = "draft"
    SENT = "sent"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


# ── Helpers ────────────────────────────────────────────────────────────────

def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def _now() -> datetime:
    return datetime.utcnow()


# ── Client ─────────────────────────────────────────────────────────────────

class Client(Base):
    __tablename__ = "clients"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_uuid
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    contact_details: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    tmps: Mapped[list["TMP"]] = relationship("TMP", back_populates="client")
    invoices: Mapped[list["Invoice"]] = relationship("Invoice", back_populates="client")


# ── TMP ────────────────────────────────────────────────────────────────────

HOURS_ALLOCATION: dict[TMPType, int] = {
    TMPType.BASIC: 6,
    TMPType.DETAILED: 6,
    TMPType.COMPLEX: 10,
    TMPType.REVISION: 0,
}

# SLA wait times in days
SLA_WAIT_DAYS: dict[str, int] = {
    "LGA": 10,
    "MRWA_RPL": 10,
    "HVS": 10,
    "PTA": 10,
    "CLIENT_REVIEW": 5,
}

# Valid status transitions
STATUS_TRANSITIONS: dict[TMPStatus, list[TMPStatus]] = {
    TMPStatus.DRAFT: [TMPStatus.PENDING_LGA, TMPStatus.PENDING_MRWA_RPL],
    TMPStatus.PENDING_LGA: [TMPStatus.PENDING_MRWA_RPL, TMPStatus.PENDING_HVS, TMPStatus.REJECTED],
    TMPStatus.PENDING_MRWA_RPL: [TMPStatus.PENDING_HVS, TMPStatus.PENDING_PTA, TMPStatus.REJECTED],
    TMPStatus.PENDING_HVS: [TMPStatus.PENDING_PTA, TMPStatus.PENDING_CLIENT_REVIEW, TMPStatus.REJECTED],
    TMPStatus.PENDING_PTA: [TMPStatus.PENDING_CLIENT_REVIEW, TMPStatus.APPROVED, TMPStatus.REJECTED],
    TMPStatus.PENDING_CLIENT_REVIEW: [TMPStatus.APPROVED, TMPStatus.REJECTED, TMPStatus.DRAFT],
    TMPStatus.APPROVED: [TMPStatus.COMPLETED, TMPStatus.REJECTED],
    TMPStatus.REJECTED: [TMPStatus.DRAFT],
    TMPStatus.COMPLETED: [],
}


class TMP(Base):
    __tablename__ = "tmps"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_uuid
    )
    tmp_number: Mapped[str] = mapped_column(
        String(50), nullable=False, unique=True, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False
    )
    type: Mapped[TMPType] = mapped_column(
        Enum(TMPType, name="tmp_type"), nullable=False, default=TMPType.BASIC
    )
    allocated_hours: Mapped[int] = mapped_column(Integer, default=0)
    hours_tracked: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[TMPStatus] = mapped_column(
        Enum(TMPStatus, name="tmp_status"), nullable=False, default=TMPStatus.DRAFT
    )
    lga_fee: Mapped[float | None] = mapped_column(Float, default=0.0)
    rtm_fee: Mapped[float | None] = mapped_column(Float, default=0.0)
    planners_involved: Mapped[list] = mapped_column(JSON, default=list)
    description: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(500))
    date_of_works: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sla_deadlines: Mapped[dict | None] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    client: Mapped["Client"] = relationship("Client", back_populates="tmps")
    invoices: Mapped[list["Invoice"]] = relationship("Invoice", back_populates="tmp")
    file_approvals: Mapped[list["FileApprovalQueue"]] = relationship(
        "FileApprovalQueue", back_populates="tmp"
    )


# ── File Approval Queue ───────────────────────────────────────────────────

class FileApprovalQueue(Base):
    __tablename__ = "file_approval_queue"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_uuid
    )
    tmp_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tmps.id"), nullable=True
    )
    file_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    file_type: Mapped[str | None] = mapped_column(String(255))
    summary: Mapped[str | None] = mapped_column(Text)
    owner: Mapped[str | None] = mapped_column(String(255))
    destination_module: Mapped[str | None] = mapped_column(String(255))
    confidence_score: Mapped[float | None] = mapped_column(Float, default=0.0)
    approval_status: Mapped[ApprovalStatus] = mapped_column(
        Enum(ApprovalStatus, name="approval_status"),
        nullable=False,
        default=ApprovalStatus.PENDING,
    )
    ai_analysis: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    tmp: Mapped["TMP"] = relationship("TMP", back_populates="file_approvals")


# ── Invoice ────────────────────────────────────────────────────────────────

class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_uuid
    )
    invoice_number: Mapped[str] = mapped_column(
        String(50), nullable=False, unique=True, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False
    )
    tmp_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tmps.id"), nullable=True
    )
    lga_fee: Mapped[float] = mapped_column(Float, default=0.0)
    rtm_fee: Mapped[float] = mapped_column(Float, default=0.0)
    hours_tracked: Mapped[float] = mapped_column(Float, default=0.0)
    hourly_rate: Mapped[float] = mapped_column(Float, default=150.0)
    labour_cost: Mapped[float] = mapped_column(Float, default=0.0)
    total_amount: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus, name="invoice_status"),
        nullable=False,
        default=InvoiceStatus.DRAFT,
    )
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    client: Mapped["Client"] = relationship("Client", back_populates="invoices")
    tmp: Mapped["TMP"] = relationship("TMP", back_populates="invoices")
