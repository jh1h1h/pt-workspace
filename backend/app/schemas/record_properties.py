from datetime import date, datetime
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field

AssetType = Literal["Application", "Domain", "Host", "API", "Environment", "Other"]
ScopeState = Literal["In Scope", "Out of Scope", "Pending Confirmation"]
SurfaceType = Literal[
    "HTTP endpoint",
    "URL/query/body parameter",
    "Form or input field",
    "Authentication flow",
    "Authorization boundary",
    "File upload functionality",
    "Client-side application route",
    "Cookie or session behaviour",
    "HTTP header",
    "CORS configuration",
    "Caching behaviour",
    "Redirect behaviour",
    "Rate limiting",
    "Error handling",
    "TLS/security configuration",
    "Third-party integration",
    "Other/custom",
]
SurfaceStatus = Literal["To Review", "In Progress", "Reviewed", "Blocked", "Not Applicable"]
BacklogStatus = Literal["Queued", "In Progress", "Blocked", "Completed", "Skipped"]
ExecutionStatus = Literal["Not Started", "In Progress", "Blocked", "Completed", "Not Applicable"]
AssessmentOutcome = Literal[
    "Not Assessed", "No Issue Observed", "Potential Finding", "Finding Confirmed", "Inconclusive"
]
ValidationStatus = Literal["Candidate", "Validating", "Confirmed", "Inconclusive", "Dismissed", "Report Ready"]
Severity = Literal["Critical", "High", "Medium", "Low", "Informational", "Unassigned"]
HttpMethod = Literal["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE", "CONNECT"]
RelationshipType = Literal[
    "related_to", "affects", "assesses", "plans", "supports", "documents", "observed_on", "depends_on"
]
ShortText = Annotated[str, Field(max_length=300)]
Tag = Annotated[str, Field(min_length=1, max_length=100)]
Tags = Annotated[list[Tag], Field(max_length=100)]


class Fields(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True, str_strip_whitespace=True, allow_inf_nan=False)


class AssetFields(Fields):
    asset_type: AssetType = "Application"
    hostname_url: str = Field(default="", max_length=2000)
    environment: str = Field(default="", max_length=100)
    scope_state: ScopeState = "Pending Confirmation"
    authentication_requirements: str = Field(default="", max_length=20000)
    application_owner: str | None = Field(default=None, max_length=200)
    authorization_confirmed: bool = False
    approval_reference: str | None = Field(default=None, max_length=1000)
    tags: Tags = Field(default_factory=list)


class SurfaceFields(Fields):
    surface_type: SurfaceType = "HTTP endpoint"
    url_route: str = Field(default="", max_length=2000)
    http_method: HttpMethod | None = None
    parameter_name: str | None = Field(default=None, max_length=300)
    parameter_location: Literal["Query", "Body", "Path", "Header", "Cookie", "Form", "Other"] | None = None
    authentication_state: str = Field(default="", max_length=300)
    roles: Tags = Field(default_factory=list)
    status: SurfaceStatus = "To Review"
    tags: Tags = Field(default_factory=list)


class BacklogFields(Fields):
    objective: str = Field(default="", max_length=20000)
    category: str = Field(default="", max_length=200)
    priority: Literal["P1", "P2", "P3"] = "P2"
    status: BacklogStatus = "Queued"
    blocker_reason: str | None = Field(default=None, max_length=20000)
    due_date: date | None = None


class TestFields(Fields):
    category: str = Field(default="", max_length=200)
    priority: Literal["P1", "P2", "P3"] = "P2"
    execution_status: ExecutionStatus = "Not Started"
    assessment_outcome: AssessmentOutcome = "Not Assessed"
    testing_notes: str = Field(default="", max_length=20000)


class FindingFields(Fields):
    vulnerability_category: str = Field(default="", max_length=200)
    cwe: str | None = Field(default=None, max_length=100)
    owasp: str | None = Field(default=None, max_length=200)
    validation_status: ValidationStatus = "Candidate"
    severity: Severity = "Unassigned"
    cvss_score: float | None = Field(default=None, ge=0, le=10)
    cvss_vector: str | None = Field(default=None, max_length=500)
    severity_rationale: str | None = Field(default=None, max_length=20000)


class EvidenceFields(Fields):
    source_reference: str = Field(default="", max_length=2000)
    media_type: str = Field(default="text/plain", max_length=100)
    sanitization_state: Literal["Unreviewed", "Sanitized", "Contains Sensitive Data"] = "Unreviewed"
    evidence_type: Literal[
        "Screenshot", "HTTP request", "HTTP response", "HTTP exchange", "Log", "Text document", "Other file"
    ] = "Other file"
    review_state: Literal["Needs Review", "Reviewed", "Restricted"] = "Needs Review"
    source_tool: str = Field(default="", max_length=300)
    captured_at: datetime | None = None


class ScopeFields(Fields):
    section: str = Field(default="Additional scope notes", min_length=1, max_length=100)


class ObservationFields(Fields):
    surface_id: str
    classification: Literal["Observed", "Advertised", "Inferred"]
    discovery_source: str = Field(min_length=1, max_length=300)
    source_reference: str = Field(default="", max_length=2000)
    observed_method: HttpMethod | None = None
    observed_at: datetime | None = None
    relevant_role: ShortText | None = None
    authentication_context: ShortText | None = None
    confidence_note: str = Field(default="", max_length=20000)
    evidence_id: str | None = None


class TemplateFields(Fields):
    record_type: Literal["test_case", "finding"] = "test_case"
    is_default: bool = False


class AssetProperties(AssetFields):
    kind: Literal["asset"] = "asset"


class SurfaceProperties(SurfaceFields):
    kind: Literal["surface"] = "surface"
    duplicate_ids: list[str] = Field(default_factory=list)


class BacklogProperties(BacklogFields):
    kind: Literal["backlog"] = "backlog"


class TestProperties(TestFields):
    kind: Literal["test_case"] = "test_case"


class FindingProperties(FindingFields):
    kind: Literal["finding"] = "finding"
    verified_at: datetime | None = None
    verification_note: str = ""


class EvidenceProperties(EvidenceFields):
    kind: Literal["evidence"] = "evidence"


class ScopeProperties(ScopeFields):
    kind: Literal["scope"] = "scope"


class ObservationProperties(ObservationFields):
    kind: Literal["observation"] = "observation"


class TemplateProperties(TemplateFields):
    kind: Literal["template"] = "template"


RecordProperties = Annotated[
    AssetProperties
    | SurfaceProperties
    | BacklogProperties
    | TestProperties
    | FindingProperties
    | EvidenceProperties
    | ScopeProperties
    | ObservationProperties
    | TemplateProperties,
    Field(discriminator="kind"),
]
PROPERTY_SCHEMAS = {
    "asset": AssetProperties,
    "surface": SurfaceProperties,
    "backlog": BacklogProperties,
    "test_case": TestProperties,
    "finding": FindingProperties,
    "evidence": EvidenceProperties,
    "scope": ScopeProperties,
    "observation": ObservationProperties,
    "template": TemplateProperties,
}
FIELD_SCHEMAS = {
    "asset": AssetFields,
    "surface": SurfaceFields,
    "backlog": BacklogFields,
    "test_case": TestFields,
    "finding": FindingFields,
    "evidence": EvidenceFields,
    "scope": ScopeFields,
    "observation": ObservationFields,
    "template": TemplateFields,
}
