from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


def uid() -> str:
    return str(uuid4())


class Engagement(Base):
    __tablename__ = "engagements"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    next_page: Mapped[int] = mapped_column(Integer, default=1)
    next_task: Mapped[int] = mapped_column(Integer, default=1)


class Page(Base):
    __tablename__ = "pages"
    __table_args__ = (
        UniqueConstraint("engagement_id", "display_id"),
        UniqueConstraint("engagement_id", "journal_date"),
        CheckConstraint("revision >= 1"),
        CheckConstraint("page_type IN ('note', 'journal', 'task', 'scratchpad')"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id"), index=True)
    display_id: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(300))
    icon: Mapped[str | None] = mapped_column(String(32), nullable=True)
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("pages.id"), nullable=True)
    page_type: Mapped[str] = mapped_column(String(30), default="note")
    journal_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    content: Mapped[dict] = mapped_column(JSON, default=lambda: {"type": "doc", "content": [{"type": "paragraph"}]})
    favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class PersonalTask(Base):
    __tablename__ = "personal_tasks"
    __table_args__ = (
        CheckConstraint("status IN ('Open', 'In Progress', 'Done')"),
        CheckConstraint("priority IN ('P1', 'P2', 'P3')"),
        CheckConstraint("position >= 0"),
    )
    page_id: Mapped[str] = mapped_column(ForeignKey("pages.id"), primary_key=True)
    status: Mapped[str] = mapped_column(String(20), default="Open")
    priority: Mapped[str] = mapped_column(String(2), default="P2")
    due_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    related_page_id: Mapped[str | None] = mapped_column(ForeignKey("pages.id"), nullable=True)
    parent_task_id: Mapped[str | None] = mapped_column(ForeignKey("personal_tasks.page_id"), nullable=True)


class RecentPage(Base):
    __tablename__ = "recent_pages"
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id"), primary_key=True)
    page_id: Mapped[str] = mapped_column(ForeignKey("pages.id"), primary_key=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime, default=now)
