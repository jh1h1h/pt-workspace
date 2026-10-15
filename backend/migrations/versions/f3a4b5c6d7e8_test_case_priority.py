"""Add stored priority to Test Cases.

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "f3a4b5c6d7e8"
down_revision: str | None = "e2f3a4b5c6d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "test_cases",
        sa.Column(
            "priority", sa.String(2), sa.CheckConstraint("priority IN ('P1', 'P2', 'P3')"),
            nullable=False, server_default="P2",
        ),
    )


def downgrade() -> None:
    op.drop_column("test_cases", "priority")