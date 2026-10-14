"""Phase 3 customization evidence search and imports

Revision ID: c9d4e5f60718
Revises: b7fa36c2836a
"""
from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa

revision: str = "c9d4e5f60718"
down_revision: str | None = "b7fa36c2836a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("evidence_items", sa.Column("evidence_type", sa.String(30), nullable=False, server_default="Other file"))
    op.add_column("evidence_items", sa.Column("review_state", sa.String(30), nullable=False, server_default="Needs Review"))
    op.add_column("evidence_items", sa.Column("source_tool", sa.String(300), nullable=False, server_default=""))
    op.add_column("evidence_items", sa.Column("captured_at", sa.DateTime(), nullable=True))
    op.create_table("document_links", sa.Column("id", sa.String(36), primary_key=True), sa.Column("engagement_id", sa.String(36), sa.ForeignKey("engagements.id"), nullable=False), sa.Column("source_id", sa.String(36), nullable=False), sa.Column("target_id", sa.String(36), nullable=False), sa.Column("origin", sa.String(20), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.ForeignKeyConstraint(["engagement_id", "source_id"], ["record_registry.engagement_id", "record_registry.page_id"]), sa.ForeignKeyConstraint(["engagement_id", "target_id"], ["record_registry.engagement_id", "record_registry.page_id"]), sa.UniqueConstraint("engagement_id", "source_id", "target_id", "origin"), sa.CheckConstraint("source_id != target_id"), sa.CheckConstraint("origin IN ('mention','wiki')"))
    op.create_index("ix_document_link_target", "document_links", ["engagement_id", "target_id"])
    op.create_table("custom_property_definitions", sa.Column("id", sa.String(36), primary_key=True), sa.Column("engagement_id", sa.String(36), sa.ForeignKey("engagements.id"), nullable=False), sa.Column("record_type", sa.String(30), nullable=False), sa.Column("name", sa.String(120), nullable=False), sa.Column("data_type", sa.String(30), nullable=False), sa.Column("allowed_values", sa.JSON(), nullable=False), sa.Column("default_value", sa.JSON(), nullable=True), sa.Column("required", sa.Boolean(), nullable=False), sa.Column("display_order", sa.Integer(), nullable=False), sa.Column("visible", sa.Boolean(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False), sa.Column("deleted_at", sa.DateTime(), nullable=True), sa.ForeignKeyConstraint(["engagement_id"], ["engagements.id"]), sa.UniqueConstraint("engagement_id", "record_type", "name"), sa.CheckConstraint("data_type IN ('text','number','checkbox','date','single_select','multi_select','url','relation')"))
    op.create_index("ix_custom_property_definitions_engagement_id", "custom_property_definitions", ["engagement_id"])
    op.create_index("ix_custom_property_definitions_record_type", "custom_property_definitions", ["record_type"])
    op.create_table("custom_property_values", sa.Column("id", sa.String(36), primary_key=True), sa.Column("engagement_id", sa.String(36), sa.ForeignKey("engagements.id"), nullable=False), sa.Column("property_id", sa.String(36), sa.ForeignKey("custom_property_definitions.id"), nullable=False), sa.Column("record_id", sa.String(36), nullable=False), sa.Column("value", sa.JSON(), nullable=True), sa.Column("updated_at", sa.DateTime(), nullable=False), sa.ForeignKeyConstraint(["engagement_id", "record_id"], ["record_registry.engagement_id", "record_registry.page_id"]), sa.UniqueConstraint("property_id", "record_id"))
    op.create_index("ix_custom_property_values_engagement_id", "custom_property_values", ["engagement_id"])
    op.create_index("ix_custom_property_values_record_id", "custom_property_values", ["record_id"])
    op.create_table("workflow_options", sa.Column("id", sa.String(36), primary_key=True), sa.Column("engagement_id", sa.String(36), sa.ForeignKey("engagements.id"), nullable=False), sa.Column("record_type", sa.String(30), nullable=False), sa.Column("label", sa.String(100), nullable=False), sa.Column("canonical_category", sa.String(30), nullable=False), sa.Column("display_order", sa.Integer(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.UniqueConstraint("engagement_id", "record_type", "label"), sa.CheckConstraint("record_type IN ('task','backlog','finding')"))
    op.create_index("ix_workflow_options_engagement_id", "workflow_options", ["engagement_id"])
    op.create_table("workflow_assignments", sa.Column("record_id", sa.String(36), primary_key=True), sa.Column("engagement_id", sa.String(36), sa.ForeignKey("engagements.id"), nullable=False), sa.Column("option_id", sa.String(36), sa.ForeignKey("workflow_options.id"), nullable=False), sa.ForeignKeyConstraint(["engagement_id", "record_id"], ["record_registry.engagement_id", "record_registry.page_id"]))
    op.create_index("ix_workflow_assignments_engagement_id", "workflow_assignments", ["engagement_id"])
    op.create_table("saved_views", sa.Column("id", sa.String(36), primary_key=True), sa.Column("engagement_id", sa.String(36), sa.ForeignKey("engagements.id"), nullable=False), sa.Column("record_type", sa.String(30), nullable=False), sa.Column("name", sa.String(120), nullable=False), sa.Column("view_type", sa.String(20), nullable=False), sa.Column("config", sa.JSON(), nullable=False), sa.Column("is_default", sa.Boolean(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False), sa.Column("deleted_at", sa.DateTime(), nullable=True), sa.CheckConstraint("record_type IN ('asset','surface','backlog','test_case','finding','evidence')"), sa.CheckConstraint("view_type IN ('table','kanban')"))
    op.create_index("ix_saved_views_engagement_id", "saved_views", ["engagement_id"])
    op.create_index("uq_default_saved_view", "saved_views", ["engagement_id", "record_type"], unique=True, sqlite_where=sa.text("is_default = 1"))
    op.create_table("reusable_templates", sa.Column("id", sa.String(36), primary_key=True), sa.Column("engagement_id", sa.String(36), sa.ForeignKey("engagements.id"), nullable=False), sa.Column("page_id", sa.String(36), sa.ForeignKey("pages.id"), nullable=False, unique=True), sa.Column("name", sa.String(120), nullable=False), sa.Column("record_type", sa.String(30), nullable=False), sa.Column("default_properties", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False), sa.Column("deleted_at", sa.DateTime(), nullable=True), sa.UniqueConstraint("engagement_id", "name"), sa.CheckConstraint("record_type IN ('note','journal','surface','test_case','finding','backlog','task')"))
    op.create_index("ix_reusable_templates_engagement_id", "reusable_templates", ["engagement_id"])
    op.create_table("evidence_files", sa.Column("id", sa.String(36), primary_key=True), sa.Column("evidence_id", sa.String(36), sa.ForeignKey("evidence_items.page_id"), nullable=False, unique=True), sa.Column("original_filename", sa.String(300), nullable=False), sa.Column("stored_filename", sa.String(100), nullable=False, unique=True), sa.Column("file_size", sa.Integer(), nullable=False), sa.Column("mime_type", sa.String(150), nullable=False), sa.Column("sha256", sa.String(64), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False))
    op.create_index("ix_evidence_files_sha256", "evidence_files", ["sha256"])
    op.create_table("import_jobs", sa.Column("id", sa.String(36), primary_key=True), sa.Column("engagement_id", sa.String(36), sa.ForeignKey("engagements.id"), nullable=False), sa.Column("format", sa.String(40), nullable=False), sa.Column("source_filename", sa.String(300), nullable=False), sa.Column("source_hash", sa.String(64), nullable=False), sa.Column("status", sa.String(20), nullable=False), sa.Column("preview", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("confirmed_at", sa.DateTime(), nullable=True), sa.CheckConstraint("status IN ('preview','confirmed','failed')"))
    op.create_index("ix_import_jobs_engagement_id", "import_jobs", ["engagement_id"])
    op.create_table("import_entries", sa.Column("id", sa.String(36), primary_key=True), sa.Column("engagement_id", sa.String(36), sa.ForeignKey("engagements.id"), nullable=False), sa.Column("import_id", sa.String(36), sa.ForeignKey("import_jobs.id"), nullable=False), sa.Column("record_id", sa.String(36), sa.ForeignKey("record_registry.page_id"), nullable=False), sa.Column("fingerprint", sa.String(64), nullable=False), sa.Column("source_row", sa.Integer(), nullable=False), sa.UniqueConstraint("engagement_id", "import_id", "fingerprint"))
    op.create_index("ix_import_entries_engagement_id", "import_entries", ["engagement_id"])
    op.execute("CREATE VIRTUAL TABLE page_search USING fts5(page_id UNINDEXED, engagement_id UNINDEXED, kind UNINDEXED, title, body, tokenize='unicode61')")


def downgrade() -> None:
    connection = op.get_bind()
    for table in ["document_links", "custom_property_definitions", "saved_views", "reusable_templates", "evidence_files", "import_jobs"]:
        if connection.execute(sa.text(f"SELECT count(*) FROM {table}")).scalar():
            raise RuntimeError("Cannot downgrade while Phase 3 data exists; export or migrate it safely first")
    op.execute("DROP TABLE page_search")
    for table in ["import_entries", "import_jobs", "evidence_files", "reusable_templates", "saved_views", "workflow_assignments", "workflow_options", "custom_property_values", "custom_property_definitions", "document_links"]:
        op.drop_table(table)
    with op.batch_alter_table("evidence_items") as batch:
        batch.drop_column("captured_at")
        batch.drop_column("source_tool")
        batch.drop_column("review_state")
        batch.drop_column("evidence_type")
