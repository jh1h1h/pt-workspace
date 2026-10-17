"""Expand Test Case priority to numeric P1-P99999 values.

Revision ID: a4b5c6d7e8f9
Revises: f3a4b5c6d7e8
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "a4b5c6d7e8f9"
down_revision: str | None = "f3a4b5c6d7e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


EXPANDED_CHECK = (
    "length(priority) BETWEEN 2 AND 6 AND substr(priority, 1, 1) = 'P' "
    "AND substr(priority, 2, 1) != '0' AND substr(priority, 2) NOT GLOB '*[^0-9]*'"
)


def upgrade() -> None:
    with op.batch_alter_table("test_cases", recreate="always") as batch:
        batch.alter_column("priority", existing_type=sa.String(2), type_=sa.String(6), existing_nullable=False)
        batch.create_check_constraint("ck_test_case_numeric_priority", EXPANDED_CHECK)


def downgrade() -> None:
    op.execute("UPDATE test_cases SET priority = 'P3' WHERE CAST(substr(priority, 2) AS INTEGER) > 3")
    with op.batch_alter_table("test_cases", recreate="always") as batch:
        batch.drop_constraint("ck_test_case_numeric_priority", type_="check")
        batch.alter_column("priority", existing_type=sa.String(6), type_=sa.String(2), existing_nullable=False)
        batch.create_check_constraint("ck_test_case_priority", "priority IN ('P1', 'P2', 'P3')")