"""EXPLICIT DEVELOPMENT SEED: fictional documentation only. Never runs on startup."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from sqlalchemy import select  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.models.entities import Engagement, Page, PersonalTask  # noqa: E402
from app.services.registry import register_page  # noqa: E402
from app.services.workspace import create_page  # noqa: E402

with SessionLocal() as db:
    if db.scalar(
        select(Engagement).where(Engagement.name == "DEMO — Fictional assessment")
    ):
        print("Development demo already exists; no duplicate records inserted.")
    else:
        engagement = Engagement(name="DEMO — Fictional assessment")
        db.add(engagement)
        db.flush()
        scratch = Page(
            engagement_id=engagement.id,
            display_id="SCRATCHPAD",
            title="Scratchpad",
            page_type="scratchpad",
        )
        db.add(scratch)
        db.flush()
        register_page(db, scratch)
        note = create_page(
            db, engagement, dict(title="Assessment journal", page_type="note")
        )
        note.content = {
            "type": "doc",
            "content": [
                {
                    "type": "heading",
                    "attrs": {"level": 2},
                    "content": [
                        {"type": "text", "text": "Fictional development workspace"}
                    ],
                },
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "Capture observations and questions here. No real targets or findings are included.",
                        }
                    ],
                },
            ],
        }
        for i, title in enumerate(
            ["Review written scope", "Organize personal testing notes"]
        ):
            task = create_page(
                db, engagement, dict(title=title, page_type="task"), True
            )
            db.add(
                PersonalTask(
                    page_id=task.id, priority="P1" if i == 0 else "P2", position=i
                )
            )
        db.commit()
        print("Created explicitly labeled fictional development content.")
