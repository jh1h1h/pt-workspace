"""Add visible general page registry kind.

Revision ID: d1e2f3a4b5c6
Revises: c9d4e5f60718
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "d1e2f3a4b5c6"
down_revision: str | None = "c9d4e5f60718"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

KINDS = "('page', 'note', 'journal', 'task', 'scratchpad', 'scope', 'asset', 'surface', 'backlog', 'test_case', 'finding', 'evidence', 'observation', 'template')"
LEGACY_KINDS = "('note', 'journal', 'task', 'scratchpad', 'scope', 'asset', 'surface', 'backlog', 'test_case', 'finding', 'evidence', 'observation', 'template')"


def _rebuild_registry(kinds: str) -> None:
    connection = op.get_bind()
    triggers = connection.execute(
        sa.text(
            "SELECT name, sql FROM sqlite_master "
            "WHERE type = 'trigger' AND sql LIKE '%record_registry%' AND sql IS NOT NULL"
        )
    ).all()
    for name, _ in triggers:
        op.execute(f'DROP TRIGGER "{name}"')
    with op.batch_alter_table(
        "record_registry",
        recreate="always",
        table_args=(sa.CheckConstraint(f"kind IN {kinds}", name="ck_record_registry_kind"),),
    ):
        pass
    for _, sql in triggers:
        op.execute(sql)


def upgrade() -> None:
    _rebuild_registry(KINDS)


def downgrade() -> None:
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT count(*) FROM record_registry WHERE kind = 'page'" )).scalar():
        raise RuntimeError("Cannot downgrade while general pages exist")
    _rebuild_registry(LEGACY_KINDS)