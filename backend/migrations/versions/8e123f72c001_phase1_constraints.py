"""Phase 1 domain constraints, compatible with earlier development schemas.

Revision ID: 8e123f72c001
Revises: 2468d1989c60
"""

from alembic import op
import sqlalchemy as sa

revision: str = "8e123f72c001"
down_revision: str | None = "2468d1989c60"
branch_labels: str | None = None
depends_on: str | None = None

PAGE_CHECKS = {
    "ck_page_revision": "revision >= 1",
    "ck_page_type": "page_type IN ('note', 'journal', 'task', 'scratchpad')",
}
TASK_CHECKS = {
    "ck_task_status": "status IN ('Open', 'In Progress', 'Done')",
    "ck_task_priority": "priority IN ('P1', 'P2', 'P3')",
    "ck_task_position": "position >= 0",
}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    page_checks = {check["sqltext"] for check in inspector.get_check_constraints("pages")}
    unique_journal = any(
        set(item["column_names"]) == {"engagement_id", "journal_date"}
        for item in inspector.get_unique_constraints("pages")
    )
    with op.batch_alter_table("pages") as batch:
        for name, condition in PAGE_CHECKS.items():
            if condition not in page_checks:
                batch.create_check_constraint(name, condition)
        if not unique_journal:
            batch.create_unique_constraint("uq_engagement_journal_date", ["engagement_id", "journal_date"])
    task_checks = {check["sqltext"] for check in inspector.get_check_constraints("personal_tasks")}
    with op.batch_alter_table("personal_tasks") as batch:
        for name, condition in TASK_CHECKS.items():
            if condition not in task_checks:
                batch.create_check_constraint(name, condition)


def downgrade() -> None:
    # Remove only constraints introduced here; identities and user records remain intact.
    inspector = sa.inspect(op.get_bind())
    checks = {item["name"] for item in inspector.get_check_constraints("personal_tasks")}
    with op.batch_alter_table("personal_tasks") as batch:
        for name in TASK_CHECKS:
            if name in checks:
                batch.drop_constraint(name, type_="check")
    checks = {item["name"] for item in inspector.get_check_constraints("pages")}
    uniques = {item["name"] for item in inspector.get_unique_constraints("pages")}
    with op.batch_alter_table("pages") as batch:
        for name in PAGE_CHECKS:
            if name in checks:
                batch.drop_constraint(name, type_="check")
        if "uq_engagement_journal_date" in uniques:
            batch.drop_constraint("uq_engagement_journal_date", type_="unique")
