from typing import Any, Literal
from uuid import UUID
from pydantic import AliasChoices, Field, create_model, field_validator
from app.schemas.contracts import PageOut, PagePatch, StrictModel, validate_document
from app.schemas.record_properties import (
    AssetFields,
    SurfaceFields,
    BacklogFields,
    TestFields,
    FindingFields,
    EvidenceFields,
    ScopeFields,
    ObservationFields,
    TemplateFields,
    FIELD_SCHEMAS,
    RelationshipType,
)


class LinkInput(StrictModel):
    target_id: UUID
    relationship_type: RelationshipType = "related_to"


class RelationshipCreate(LinkInput):
    source_id: UUID


class RecordCreate(StrictModel):
    title: str = Field(min_length=1, max_length=300)
    icon: str | None = Field(default=None, max_length=32)
    parent_id: UUID | None = None
    content: dict[str, Any] | None = None
    links: list[LinkInput] = Field(default_factory=list, max_length=100)
    custom_values: dict[UUID, Any] = Field(default_factory=dict, max_length=100)

    @field_validator("content")
    @classmethod
    def document(cls, value: dict | None) -> dict | None:
        return validate_document(value) if value is not None else value


class AssetCreate(RecordCreate, AssetFields):
    title: str = Field(min_length=1, max_length=300, validation_alias=AliasChoices("title", "name"))


class SurfaceCreate(RecordCreate, SurfaceFields):
    pass


class BacklogCreate(RecordCreate, BacklogFields):
    pass


class TestCreate(RecordCreate, TestFields):
    template_id: UUID | None = None


class TestCasePurgePreview(StrictModel):
    count: int
    confirmation: str


class TestCaseReplace(StrictModel):
    confirmation: str = Field(pattern=r"^[0-9a-f]{64}$")
    cases: list[TestCreate] = Field(min_length=1, max_length=1000)


class TestCaseReplaceResult(StrictModel):
    purged: int
    created: list[PageOut]


class FindingCreate(RecordCreate, FindingFields):
    template_id: UUID | None = None


class EvidenceCreate(RecordCreate, EvidenceFields):
    pass


class ScopeCreate(RecordCreate, ScopeFields):
    pass


class ObservationCreate(RecordCreate, ObservationFields):
    pass


class TemplateCreate(RecordCreate, TemplateFields):
    pass


CREATE_SCHEMAS = {
    "asset": AssetCreate,
    "surface": SurfaceCreate,
    "backlog": BacklogCreate,
    "test_case": TestCreate,
    "finding": FindingCreate,
    "evidence": EvidenceCreate,
    "scope": ScopeCreate,
    "observation": ObservationCreate,
    "template": TemplateCreate,
}

# Partial updates retain the same enum/range/list validation as creates.
# Observation provenance is append-only: only its Page document/title can be edited.
PATCH_SCHEMAS: dict[str, type] = {}
for kind, schema in FIELD_SCHEMAS.items():
    fields: dict[str, Any] = {}
    if kind != "observation":
        for name, field in schema.model_fields.items():
            annotation = field.annotation
            if field.metadata:
                from typing import Annotated

                annotation = Annotated[annotation, *field.metadata]
            fields[name] = (annotation | None, Field(default=None))
    PATCH_SCHEMAS[kind] = create_model(f"{kind.title().replace('_', '')}Patch", __base__=PagePatch, **fields)


class VerifyFinding(StrictModel):
    revision: int = Field(ge=1)
    verification_note: str = Field(min_length=1, max_length=20000)


class RecordRef(StrictModel):
    id: str
    display_id: str
    title: str
    kind: str
    deleted: bool


class RelationshipOut(StrictModel):
    id: str
    source: RecordRef
    target: RecordRef
    relationship_type: RelationshipType
    direction: Literal["outgoing", "incoming"]
    created_at: str


class RelationshipBatch(StrictModel):
    source_id: UUID
    links: list[LinkInput] = Field(min_length=1, max_length=100)
