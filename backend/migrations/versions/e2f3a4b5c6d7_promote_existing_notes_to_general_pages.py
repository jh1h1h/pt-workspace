"""Promote existing note documents to visible general pages.

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "e2f3a4b5c6d7"
down_revision: str | None = "d1e2f3a4b5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _reclassify(source: str, target: str) -> None:
    connection = op.get_bind()
    trigger_sql = connection.execute(
        sa.text(
            "SELECT sql FROM sqlite_master "
            "WHERE type = 'trigger' AND name = 'registry_identity_immutable'"
        )
    ).scalar_one()
    op.execute('DROP TRIGGER "registry_identity_immutable"')
    try:
        op.execute(
            sa.text(
                f"UPDATE record_registry SET kind = '{target}' "
                f"WHERE kind = '{source}' AND EXISTS ("
                "SELECT 1 FROM pages "
                "WHERE pages.id = record_registry.page_id "
                "AND pages.engagement_id = record_registry.engagement_id "
                "AND pages.page_type = 'note'"
                ")"
            )
        )
    finally:
        op.execute(trigger_sql)


def upgrade() -> None:
    _reclassify("note", "page")


def downgrade() -> None:
    _reclassify("page", "note")
