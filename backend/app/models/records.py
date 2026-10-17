from datetime import datetime
from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.entities import now, uid

KINDS = (
    "page",
    "note",
    "journal",
    "task",
    "scratchpad",
    "scope",
    "asset",
    "surface",
    "backlog",
    "test_case",
    "finding",
    "evidence",
    "observation",
    "template",
)


class RecordRegistry(Base):
    __tablename__ = "record_registry"
    __table_args__ = (UniqueConstraint("engagement_id", "page_id"), CheckConstraint(f"kind IN {KINDS}"))
    page_id: Mapped[str] = mapped_column(ForeignKey("pages.id"), primary_key=True)
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30))


class RecordSequence(Base):
    __tablename__ = "record_sequences"
    __table_args__ = (CheckConstraint("next_value >= 1"),)
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id"), primary_key=True)
    kind: Mapped[str] = mapped_column(String(30), primary_key=True)
    next_value: Mapped[int] = mapped_column(Integer, default=1)


class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = (
        CheckConstraint("asset_type IN ('Application', 'Domain', 'Host', 'API', 'Environment', 'Other')"),
        CheckConstraint("scope_state IN ('In Scope', 'Out of Scope', 'Pending Confirmation')"),
        CheckConstraint("scope_state != 'In Scope' OR authorization_confirmed = 1"),
    )
    page_id: Mapped[str] = mapped_column(ForeignKey("record_registry.page_id"), primary_key=True)
    asset_type: Mapped[str] = mapped_column(String(30), default="Application")
    hostname_url: Mapped[str] = mapped_column(String(2000), default="")
    environment: Mapped[str] = mapped_column(String(100), default="")
    scope_state: Mapped[str] = mapped_column(String(30), default="Pending Confirmation")
    authentication_requirements: Mapped[str] = mapped_column(Text, default="")
    application_owner: Mapped[str | None] = mapped_column(String(200), nullable=True)
    authorization_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    approval_reference: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)


class AttackSurface(Base):
    __tablename__ = "attack_surfaces"
    __table_args__ = (
        CheckConstraint("status IN ('To Review', 'In Progress', 'Reviewed', 'Blocked', 'Not Applicable')"),
        Index("ix_surface_identity", "normalized_route", "http_method", "authentication_state"),
    )
    page_id: Mapped[str] = mapped_column(ForeignKey("record_registry.page_id"), primary_key=True)
    surface_type: Mapped[str] = mapped_column(String(80), default="HTTP endpoint")
    url_route: Mapped[str] = mapped_column(String(2000), default="")
    normalized_route: Mapped[str] = mapped_column(String(2000), default="")
    http_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    parameter_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    parameter_location: Mapped[str | None] = mapped_column(String(30), nullable=True)
    authentication_state: Mapped[str] = mapped_column(String(300), default="")
    roles: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(30), default="To Review")
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)


class BacklogItem(Base):
    __tablename__ = "backlog_items"
    __table_args__ = (
        CheckConstraint("priority IN ('P1', 'P2', 'P3')"),
        CheckConstraint("status IN ('Queued', 'In Progress', 'Blocked', 'Completed', 'Skipped')"),
        CheckConstraint("status != 'Blocked' OR length(trim(coalesce(blocker_reason, ''))) > 0"),
    )
    page_id: Mapped[str] = mapped_column(ForeignKey("record_registry.page_id"), primary_key=True)
    objective: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(200), default="")
    priority: Mapped[str] = mapped_column(String(2), default="P2")
    status: Mapped[str] = mapped_column(String(30), default="Queued")
    blocker_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_date: Mapped[str | None] = mapped_column(String(10), nullable=True)


class TestCase(Base):
    __tablename__ = "test_cases"
    __table_args__ = (
        CheckConstraint(
            "length(priority) BETWEEN 2 AND 6 AND substr(priority, 1, 1) = 'P' "
            "AND substr(priority, 2, 1) != '0' AND substr(priority, 2) NOT GLOB '*[^0-9]*'"
        ),
        CheckConstraint("execution_status IN ('Not Started', 'In Progress', 'Blocked', 'Completed', 'Not Applicable')"),
        CheckConstraint(
            "assessment_outcome IN ('Not Assessed', 'No Issue Observed', 'Potential Finding', 'Finding Confirmed', 'Inconclusive')"
        ),
    )
    page_id: Mapped[str] = mapped_column(ForeignKey("record_registry.page_id"), primary_key=True)
    category: Mapped[str] = mapped_column(String(200), default="")
    priority: Mapped[str] = mapped_column(String(6), default="P2")
    execution_status: Mapped[str] = mapped_column(String(30), default="Not Started")
    assessment_outcome: Mapped[str] = mapped_column(String(30), default="Not Assessed")
    testing_notes: Mapped[str] = mapped_column(Text, default="")


class Finding(Base):
    __tablename__ = "findings"
    __table_args__ = (
        CheckConstraint(
            "validation_status IN ('Candidate', 'Validating', 'Confirmed', 'Inconclusive', 'Dismissed', 'Report Ready')"
        ),
        CheckConstraint("severity IN ('Critical', 'High', 'Medium', 'Low', 'Informational', 'Unassigned')"),
        CheckConstraint("cvss_score IS NULL OR (cvss_score >= 0 AND cvss_score <= 10)"),
        CheckConstraint(
            "validation_status NOT IN ('Confirmed', 'Report Ready') OR (verified_at IS NOT NULL AND length(trim(verification_note)) > 0)"
        ),
    )
    page_id: Mapped[str] = mapped_column(ForeignKey("record_registry.page_id"), primary_key=True)
    vulnerability_category: Mapped[str] = mapped_column(String(200), default="")
    cwe: Mapped[str | None] = mapped_column(String(100), nullable=True)
    owasp: Mapped[str | None] = mapped_column(String(200), nullable=True)
    validation_status: Mapped[str] = mapped_column(String(30), default="Candidate")
    severity: Mapped[str] = mapped_column(String(30), default="Unassigned")
    cvss_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    cvss_vector: Mapped[str | None] = mapped_column(String(500), nullable=True)
    severity_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_note: Mapped[str] = mapped_column(Text, default="")
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Evidence(Base):
    __tablename__ = "evidence_items"
    __table_args__ = (CheckConstraint("sanitization_state IN ('Unreviewed', 'Sanitized', 'Contains Sensitive Data')"),)
    page_id: Mapped[str] = mapped_column(ForeignKey("record_registry.page_id"), primary_key=True)
    source_reference: Mapped[str] = mapped_column(String(2000), default="")
    media_type: Mapped[str] = mapped_column(String(100), default="text/plain")
    sanitization_state: Mapped[str] = mapped_column(String(30), default="Unreviewed")
    evidence_type: Mapped[str] = mapped_column(String(30), default="Other file")
    review_state: Mapped[str] = mapped_column(String(30), default="Needs Review")
    source_tool: Mapped[str] = mapped_column(String(300), default="")
    captured_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ScopeDocument(Base):
    __tablename__ = "scope_documents"
    page_id: Mapped[str] = mapped_column(ForeignKey("record_registry.page_id"), primary_key=True)
    section: Mapped[str] = mapped_column(String(100), default="Additional scope notes")


class DiscoveryObservation(Base):
    __tablename__ = "discovery_observations"
    __table_args__ = (CheckConstraint("classification IN ('Observed', 'Advertised', 'Inferred')"),)
    page_id: Mapped[str] = mapped_column(ForeignKey("record_registry.page_id"), primary_key=True)
    surface_id: Mapped[str] = mapped_column(ForeignKey("attack_surfaces.page_id"), index=True)
    classification: Mapped[str] = mapped_column(String(20))
    discovery_source: Mapped[str] = mapped_column(String(300))
    source_reference: Mapped[str] = mapped_column(String(2000), default="")
    observed_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    relevant_role: Mapped[str | None] = mapped_column(String(300), nullable=True)
    authentication_context: Mapped[str | None] = mapped_column(String(300), nullable=True)
    confidence_note: Mapped[str] = mapped_column(Text, default="")
    evidence_id: Mapped[str | None] = mapped_column(ForeignKey("evidence_items.page_id"), nullable=True)


class DocumentTemplate(Base):
    __tablename__ = "document_templates"
    __table_args__ = (
        CheckConstraint("record_type IN ('test_case', 'finding')"),
        Index(
            "uq_default_template",
            "engagement_id",
            "record_type",
            unique=True,
            sqlite_where=text("is_default = 1"),
        ),
    )
    page_id: Mapped[str] = mapped_column(ForeignKey("record_registry.page_id"), primary_key=True)
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id"))
    record_type: Mapped[str] = mapped_column(String(30), default="test_case")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)


class ReusableTemplate(Base):
    __tablename__ = "reusable_templates"
    __table_args__ = (
        CheckConstraint("record_type IN ('note','journal','surface','test_case','finding','backlog','task')"),
        UniqueConstraint("engagement_id", "name"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id"), index=True)
    page_id: Mapped[str] = mapped_column(ForeignKey("pages.id"), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    record_type: Mapped[str] = mapped_column(String(30))
    default_properties: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class RecordRelationship(Base):
    __tablename__ = "record_relationships"
    __table_args__ = (
        ForeignKeyConstraint(
            ["engagement_id", "source_id"], ["record_registry.engagement_id", "record_registry.page_id"]
        ),
        ForeignKeyConstraint(
            ["engagement_id", "target_id"], ["record_registry.engagement_id", "record_registry.page_id"]
        ),
        UniqueConstraint("engagement_id", "pair_key", "relationship_type"),
        CheckConstraint("source_id != target_id"),
        CheckConstraint(
            "relationship_type IN ('related_to', 'affects', 'assesses', 'plans', 'supports', 'documents', 'observed_on', 'depends_on')"
        ),
        Index("ix_relationship_source", "engagement_id", "source_id"),
        Index("ix_relationship_target", "engagement_id", "target_id"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id"))
    source_id: Mapped[str] = mapped_column(String(36))
    target_id: Mapped[str] = mapped_column(String(36))
    pair_key: Mapped[str] = mapped_column(String(80))
    origin: Mapped[str] = mapped_column(String(30), default="manual")
    relationship_type: Mapped[str] = mapped_column(String(30), default="related_to")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class DocumentLink(Base):
    __tablename__ = "document_links"
    __table_args__ = (
        ForeignKeyConstraint(
            ["engagement_id", "source_id"], ["record_registry.engagement_id", "record_registry.page_id"]
        ),
        ForeignKeyConstraint(
            ["engagement_id", "target_id"], ["record_registry.engagement_id", "record_registry.page_id"]
        ),
        UniqueConstraint("engagement_id", "source_id", "target_id", "origin"),
        CheckConstraint("source_id != target_id"),
        CheckConstraint("origin IN ('mention', 'wiki')"),
        Index("ix_document_link_target", "engagement_id", "target_id"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id"))
    source_id: Mapped[str] = mapped_column(String(36))
    target_id: Mapped[str] = mapped_column(String(36))
    origin: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class CustomPropertyDefinition(Base):
    __tablename__ = "custom_property_definitions"
    __table_args__ = (
        CheckConstraint("data_type IN ('text','number','checkbox','date','single_select','multi_select','url','relation')"),
        UniqueConstraint("engagement_id", "record_type", "name"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id"), index=True)
    record_type: Mapped[str] = mapped_column(String(30), index=True)
    name: Mapped[str] = mapped_column(String(120))
    data_type: Mapped[str] = mapped_column(String(30))
    allowed_values: Mapped[list[str]] = mapped_column(JSON, default=list)
    default_value: Mapped[object | None] = mapped_column(JSON, nullable=True)
    required: Mapped[bool] = mapped_column(Boolean, default=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    visible: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class CustomPropertyValue(Base):
    __tablename__ = "custom_property_values"
    __table_args__ = (
        UniqueConstraint("property_id", "record_id"),
        ForeignKeyConstraint(
            ["engagement_id", "record_id"], ["record_registry.engagement_id", "record_registry.page_id"]
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id"), index=True)
    property_id: Mapped[str] = mapped_column(ForeignKey("custom_property_definitions.id"))
    record_id: Mapped[str] = mapped_column(String(36), index=True)
    value: Mapped[object | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class WorkflowOption(Base):
    __tablename__ = "workflow_options"
    __table_args__ = (
        UniqueConstraint("engagement_id", "record_type", "label"),
        CheckConstraint("record_type IN ('task','backlog','finding')"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id"), index=True)
    record_type: Mapped[str] = mapped_column(String(30))
    label: Mapped[str] = mapped_column(String(100))
    canonical_category: Mapped[str] = mapped_column(String(30))
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class WorkflowAssignment(Base):
    __tablename__ = "workflow_assignments"
    __table_args__ = (
        ForeignKeyConstraint(
            ["engagement_id", "record_id"], ["record_registry.engagement_id", "record_registry.page_id"]
        ),
    )
    record_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id"), index=True)
    option_id: Mapped[str] = mapped_column(ForeignKey("workflow_options.id"))


class SavedView(Base):
    __tablename__ = "saved_views"
    __table_args__ = (
        CheckConstraint("record_type IN ('asset','surface','backlog','test_case','finding','evidence')"),
        CheckConstraint("view_type IN ('table','kanban')"),
        Index("uq_default_saved_view", "engagement_id", "record_type", unique=True, sqlite_where=text("is_default = 1")),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id"), index=True)
    record_type: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(120))
    view_type: Mapped[str] = mapped_column(String(20), default="table")
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class EvidenceFile(Base):
    __tablename__ = "evidence_files"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    evidence_id: Mapped[str] = mapped_column(ForeignKey("evidence_items.page_id"), unique=True)
    original_filename: Mapped[str] = mapped_column(String(300))
    stored_filename: Mapped[str] = mapped_column(String(100), unique=True)
    file_size: Mapped[int] = mapped_column(Integer)
    mime_type: Mapped[str] = mapped_column(String(150))
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class ImportJob(Base):
    __tablename__ = "import_jobs"
    __table_args__ = (CheckConstraint("status IN ('preview','confirmed','failed')"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id"), index=True)
    format: Mapped[str] = mapped_column(String(40))
    source_filename: Mapped[str] = mapped_column(String(300))
    source_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(20), default="preview")
    preview: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ImportEntry(Base):
    __tablename__ = "import_entries"
    __table_args__ = (UniqueConstraint("engagement_id", "import_id", "fingerprint"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id"), index=True)
    import_id: Mapped[str] = mapped_column(ForeignKey("import_jobs.id"))
    record_id: Mapped[str] = mapped_column(ForeignKey("record_registry.page_id"))
    fingerprint: Mapped[str] = mapped_column(String(64))
    source_row: Mapped[int] = mapped_column(Integer)


RECORD_MODELS = {
    "asset": Asset,
    "surface": AttackSurface,
    "backlog": BacklogItem,
    "test_case": TestCase,
    "finding": Finding,
    "evidence": Evidence,
    "scope": ScopeDocument,
    "observation": DiscoveryObservation,
    "template": DocumentTemplate,
}
