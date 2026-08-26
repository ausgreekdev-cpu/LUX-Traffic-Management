"""
AI File Routing Agent for TMP documents.

Uses LangChain + OpenAI structured output to classify incoming documents
and route them to the correct destination module for human approval.
"""

from typing import Optional

from pydantic import BaseModel, Field

# LangChain / LLM imports — will gracefully degrade if not installed
try:
    from langchain_openai import ChatOpenAI
    from langchain.prompts import PromptTemplate
    HAS_LANGCHAIN = True
except ImportError:  # pragma: no cover
    HAS_LANGCHAIN = False

import re
import os


# ── Structured Output Schema ───────────────────────────────────────────────

class FileRoutingDecision(BaseModel):
    """Structured classification for an incoming TMP document."""

    file_type: str = Field(
        description="The type of document, e.g., LGA Permit, MRWA RPL, "
                    "Client Invoice, Traffic Guidance Scheme, etc."
    )
    summary: str = Field(
        description="A brief summary of the document contents"
    )
    owner: str = Field(
        description="The entity or person this file belongs to "
                    "(e.g., City of Sydney, Transport NSW, John Smith)"
    )
    destination_module: str = Field(
        description="Where this file should be saved / routed: "
                    "'TMP_Attachments', 'Client_Profile', 'Invoicing', "
                    "'Permits_LGA', 'Approvals'"
    )
    confidence_score: float = Field(
        description="Confidence from 0.0 to 1.0",
        ge=0.0,
        le=1.0,
    )


# ── Fallback Rule-Based Classifier ─────────────────────────────────────────

def _rule_based_classify(text: str) -> FileRoutingDecision:
    """Fallback rule-engine when no LLM is available."""
    text_lower = text.lower()

    # File type detection
    if "lga" in text_lower or "permit" in text_lower or "council" in text_lower:
        file_type = "LGA Permit"
    elif "mrwa" in text_lower or "rpl" in text_lower:
        file_type = "MRWA RPL"
    elif "invoice" in text_lower or "bill" in text_lower or "payment" in text_lower:
        file_type = "Client Invoice"
    elif "hvs" in text_lower or "heavy vehicle" in text_lower:
        file_type = "HVS Application"
    elif "traffic guidance" in text_lower or "tgs" in text_lower:
        file_type = "Traffic Guidance Scheme"
    elif "pedestrian" in text_lower or "footpath" in text_lower:
        file_type = "Pedestrian Management Plan"
    elif "client" in text_lower or "review" in text_lower or "feedback" in text_lower:
        file_type = "Client Review"
    elif "approval" in text_lower or "approved" in text_lower:
        file_type = "Approval Certificate"
    elif "plan" in text_lower or "tmp" in text_lower:
        file_type = "Traffic Management Plan"
    else:
        file_type = "General Document"

    # Destination mapping
    if "invoice" in file_type.lower():
        destination = "Invoicing"
    elif "permit" in file_type.lower() or "lga" in file_type.lower():
        destination = "Permits_LGA"
    elif "review" in file_type.lower() or "feedback" in file_type.lower():
        destination = "Client_Profile"
    elif "approval" in file_type.lower():
        destination = "Approvals"
    else:
        destination = "TMP_Attachments"

    # Owner extraction (simple regex fallback)
    owner_patterns = [
        r"(?:prepared by|author|owner|submitted by|from)\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
        r"(?:organization|company|council|authority)\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
    ]
    owner = "Unknown"
    for pattern in owner_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            owner = match.group(1).strip()
            break

    # Summary (first 200 chars)
    clean = re.sub(r'\s+', ' ', text[:500]).strip()
    summary = clean[:200] + ("..." if len(clean) > 200 else "")

    return FileRoutingDecision(
        file_type=file_type,
        summary=summary,
        owner=owner,
        destination_module=destination,
        confidence_score=0.6,  # moderate confidence for rule-based
    )


# ── LLM-Powered Routing ────────────────────────────────────────────────────

def _llm_classify(text: str, api_key: str | None = None, model: str = "gpt-4o") -> FileRoutingDecision | None:
    """Use LangChain + OpenAI structured output to classify the document."""
    if not HAS_LANGCHAIN:
        return None

    key = api_key or os.getenv("OPENAI_API_KEY", "")
    if not key:
        return None

    try:
        llm = ChatOpenAI(temperature=0.0, model=model, api_key=key)

        prompt = PromptTemplate.from_template(
            """You are an intelligent document routing agent for a Traffic Management Plan (TMP) company.

Analyze the following document text and determine its routing parameters.

Document Text:
{text}

Return the classification as structured JSON with these fields:
- file_type: the document type (e.g., LGA Permit, MRWA RPL, Client Invoice, TGS, etc.)
- summary: one-paragraph summary of contents
- owner: the entity or person it belongs to
- destination_module: one of 'TMP_Attachments', 'Client_Profile', 'Invoicing', 'Permits_LGA', 'Approvals'
- confidence_score: float 0.0 to 1.0
"""
        )

        runnable = prompt | llm.with_structured_output(schema=FileRoutingDecision)
        return runnable.invoke({"text": text[:8000]})

    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "LLM classification failed, falling back: %s", exc
        )
        return None


# ── Public API ─────────────────────────────────────────────────────────────

def route_incoming_document(
    document_text: str,
    api_key: str | None = None,
    model: str = "gpt-4o",
) -> FileRoutingDecision:
    """
    Process raw text from an uploaded file and determine its routing.

    Uses LLM-powered structured classification when an OpenAI API key is
    available; falls back to a rule-based classifier otherwise.

    Returns a ``FileRoutingDecision`` with file_type, summary, owner,
    destination_module, and confidence_score.
    """
    # Try LLM first
    decision = _llm_classify(document_text, api_key=api_key, model=model)

    if decision is None:
        decision = _rule_based_classify(document_text)

    return decision
