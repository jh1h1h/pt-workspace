from datetime import datetime
from pathlib import Path
from typing import Any
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session, sessionmaker
from app.models.entities import Page, RecentPage

DOC: dict[str, Any] = {
    "type": "doc",
    "content": [
        {
            "type": "heading",
            "attrs": {"level": 2},
            "content": [{"type": "text", "text": "Focus", "marks": [{"type": "bold"}]}],
        },
        {
            "type": "paragraph",
            "content": [
                {
                    "type": "text",
                    "text": "Styled",
                    "marks": [{"type": "italic"}, {"type": "underline"}, {"type": "code"}],
                }
            ],
        },
        {
            "type": "bulletList",
            "content": [
                {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "one"}]}]}
            ],
        },
        {
            "type": "orderedList",
            "attrs": {"start": 2},
            "content": [
                {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "two"}]}]}
            ],
        },
        {
            "type": "taskList",
            "content": [
                {
                    "type": "taskItem",
                    "attrs": {"checked": False},
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "check"}]}],
                }
            ],
        },
        {"type": "codeBlock", "attrs": {"language": "python"}, "content": [{"type": "text", "text": "print(1)"}]},
        {"type": "blockquote", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Quote"}]}]},
        {"type": "horizontalRule"},
        {
            "type": "table",
            "content": [
                {
                    "type": "tableRow",
                    "content": [
                        {
                            "type": "tableHeader",
                            "attrs": {"colspan": 1, "rowspan": 1, "colwidth": None},
                            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Header"}]}],
                        },
                        {"type": "tableCell", "content": [{"type": "paragraph"}]},
                    ],
                }
            ],
        },
    ],
}


def engagement(client: TestClient, name: str = "Assessment") -> str:
    response = client.post("/api/v1/engagements", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def create_page(client: TestClient, eid: str, title: str = "Notes", **values: Any) -> dict:
    response = client.post(f"/api/v1/engagements/{eid}/pages", json={"title": title, **values})
    assert response.status_code == 201, response.text
    return response.json()


def create_task(client: TestClient, eid: str, title: str = "Review", **values: Any) -> dict:
    response = client.post(f"/api/v1/engagements/{eid}/tasks", json={"title": title, **values})
    assert response.status_code == 201, response.text
    return response.json()


def test_P1_B01_engagement_isolation(client: TestClient) -> None:
    one, two = engagement(client, "One"), engagement(client, "Two")
    create_page(client, one)
    create_task(client, one)
    assert client.get(f"/api/v1/engagements/{two}/pages").json()["items"] == []
    assert client.get(f"/api/v1/engagements/{two}/tasks").json()["items"] == []
    assert len(client.get(f"/api/v1/engagements/{one}/pages").json()["items"]) == 2


def test_P1_B02_page_lifecycle(client: TestClient) -> None:
    eid = engagement(client)
    p = create_page(client, eid)
    assert p["page_type"] == "page"
    url = f"/api/v1/engagements/{eid}/pages/{p['id']}"
    response = client.patch(url, json={"revision": p["revision"], "title": "Updated", "icon": "🔎", "favorite": True})
    assert response.status_code == 200
    assert client.get(url).json()["title"] == "Updated"
    assert client.delete(url).status_code == 204
    assert client.get(url).status_code == 404
    assert client.get(f"/api/v1/engagements/{eid}/pages?deleted=true").json()["items"][0]["id"] == p["id"]
    assert client.post(url + "/restore").json()["title"] == "Updated"


def test_P1_B03_nested_cycles(client: TestClient) -> None:
    eid = engagement(client)
    a = create_page(client, eid, "A")
    b = create_page(client, eid, "B", parent_id=a["id"])
    c = create_page(client, eid, "C", parent_id=b["id"])
    response = client.patch(f"/api/v1/engagements/{eid}/pages/{a['id']}", json={"revision": 1, "parent_id": c["id"]})
    assert response.status_code == 422
    assert client.get(f"/api/v1/engagements/{eid}/pages/{a['id']}").json()["parent_id"] is None
    assert (
        client.patch(
            f"/api/v1/engagements/{eid}/pages/{b['id']}", json={"revision": 1, "parent_id": b["id"]}
        ).status_code
        == 422
    )


def test_P1_B04_document_roundtrip(client: TestClient) -> None:
    eid = engagement(client)
    p = create_page(client, eid, content=DOC)
    assert client.get(f"/api/v1/engagements/{eid}/pages/{p['id']}").json()["content"] == DOC


def test_P1_B05_invalid_json(client: TestClient) -> None:
    eid = engagement(client)
    for doc in [
        {"type": "html", "content": []},
        {"type": "doc", "content": [{"type": "text", "text": "bad"}]},
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "click",
                            "marks": [{"type": "link", "attrs": {"href": "javascript:alert(1)"}}],
                        }
                    ],
                }
            ],
        },
        {"type": "doc", "content": [{"type": "heading", "attrs": {"level": 4}}]},
    ]:
        assert client.post(f"/api/v1/engagements/{eid}/pages", json={"title": "Bad", "content": doc}).status_code == 422


def test_P1_B06_personal_task_lifecycle(client: TestClient) -> None:
    eid = engagement(client)
    a = create_task(client, eid, "A", priority="P1")
    b = create_task(client, eid, "B", priority="P1")
    url = f"/api/v1/engagements/{eid}/tasks"
    reorder = client.post(
        url + "/reorder", json={"items": [{"id": b["id"], "revision": 1}, {"id": a["id"], "revision": 1}]}
    )
    assert reorder.status_code == 200, reorder.text
    assert [p["title"] for p in client.get(url).json()["items"]] == ["B", "A"]
    p = client.patch(
        url + "/" + a["id"],
        json={"revision": 2, "status": "Done", "title": "Edited", "priority": "P3", "due_date": "2027-01-01"},
    ).json()
    assert p["task"]["status"] == "Done"
    p = client.patch(url + "/" + a["id"], json={"revision": p["revision"], "status": "Open"}).json()
    assert p["task"]["status"] == "Open"
    assert p["display_id"] == a["display_id"]
    assert client.delete(f"/api/v1/engagements/{eid}/pages/{a['id']}").status_code == 204
    assert client.get(url + "/" + a["id"]).status_code == 404


def test_P1_B07_task_filters(client: TestClient) -> None:
    eid = engagement(client)
    create_task(client, eid, "High", priority="P1", status="In Progress", due_date="2027-01-01")
    create_task(client, eid, "Low", priority="P3")
    url = f"/api/v1/engagements/{eid}/tasks"
    for filters in ["status=In%20Progress", "priority=P1", "due_before=2027-02-01", "q=High"]:
        assert [p["title"] for p in client.get(url + "?" + filters).json()["items"]] == ["High"]


def test_P1_B08_task_cross_engagement(client: TestClient) -> None:
    one, two = engagement(client, "One"), engagement(client, "Two")
    p = create_task(client, one)
    url = f"/api/v1/engagements/{two}/tasks/{p['id']}"
    assert client.get(url).status_code == 404
    assert client.patch(url, json={"revision": 1, "status": "Done"}).status_code == 404
    assert (
        client.post(
            f"/api/v1/engagements/{two}/tasks", json={"title": "Foreign", "related_page_id": p["id"]}
        ).status_code
        == 404
    )


def test_P1_B09_independent_scratchpads(client: TestClient) -> None:
    one, two = engagement(client, "One"), engagement(client, "Two")
    p = client.get(f"/api/v1/engagements/{one}/scratchpad").json()
    assert (
        client.patch(f"/api/v1/engagements/{one}/pages/{p['id']}", json={"revision": 1, "content": DOC}).status_code
        == 200
    )
    assert client.get(f"/api/v1/engagements/{one}/scratchpad").json()["content"] == DOC
    assert client.get(f"/api/v1/engagements/{two}/scratchpad").json()["content"] != DOC


def test_P1_B10_recent_order(client: TestClient) -> None:
    eid = engagement(client)
    pages = [create_page(client, eid, str(i)) for i in range(10)]
    for p in pages:
        assert client.post(f"/api/v1/engagements/{eid}/pages/{p['id']}/open").status_code == 204
    client.post(f"/api/v1/engagements/{eid}/pages/{pages[3]['id']}/open")
    recent = client.get(f"/api/v1/engagements/{eid}/recent").json()
    assert len(recent) == 8
    assert [p["title"] for p in recent] == ["3", "9", "8", "7", "6", "5", "4", "2"]


def test_P1_B11_recent_new_session(client: TestClient, database: sessionmaker[Session]) -> None:
    eid = engagement(client)
    p = create_page(client, eid)
    client.post(f"/api/v1/engagements/{eid}/pages/{p['id']}/open")
    with database() as fresh:
        recent = fresh.scalars(select(RecentPage).where(RecentPage.engagement_id == eid)).one()
        assert recent.page_id == p["id"]
        assert isinstance(recent.opened_at, datetime)


def test_P1_B12_recent_excludes_deleted(client: TestClient) -> None:
    eid = engagement(client)
    p = create_page(client, eid)
    url = f"/api/v1/engagements/{eid}/pages/{p['id']}"
    client.post(url + "/open")
    client.delete(url)
    assert client.get(f"/api/v1/engagements/{eid}/recent").json() == []


def test_P1_B13_stale_revision(client: TestClient) -> None:
    eid = engagement(client)
    p = create_page(client, eid)
    url = f"/api/v1/engagements/{eid}/pages/{p['id']}"
    assert client.patch(url, json={"revision": 1, "content": DOC}).status_code == 200
    assert client.patch(url, json={"revision": 1, "title": "Stale"}).status_code == 409
    persisted = client.get(url).json()
    assert persisted["content"] == DOC and persisted["title"] == "Notes" and persisted["revision"] == 2


def test_P1_B14_empty_database_migrations(database: sessionmaker[Session], monkeypatch: Any) -> None:
    with database() as db:
        assert {"engagements", "pages", "personal_tasks", "recent_pages", "alembic_version"} <= set(
            inspect(db.bind).get_table_names()
        )
        assert db.scalar(select(Page)) is None
        assert db.scalar(text("PRAGMA foreign_keys")) == 1
        # Rerunning migrations at head leaves the empty database usable.
        config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        command.upgrade(config, "head")


def test_P1_B15_stable_ids(client: TestClient) -> None:
    eid = engagement(client)
    p = create_page(client, eid)
    updated = client.patch(
        f"/api/v1/engagements/{eid}/pages/{p['id']}", json={"revision": 1, "title": "Renamed"}
    ).json()
    assert updated["id"] == p["id"] and updated["display_id"] == p["display_id"]


def test_children_promoted_and_restore(client: TestClient) -> None:
    eid = engagement(client)
    a = create_page(client, eid, "Parent")
    b = create_page(client, eid, "Child", parent_id=a["id"])
    client.delete(f"/api/v1/engagements/{eid}/pages/{a['id']}")
    child = client.get(f"/api/v1/engagements/{eid}/pages/{b['id']}").json()
    assert child["parent_id"] is None and child["revision"] == 2
    client.post(f"/api/v1/engagements/{eid}/pages/{a['id']}/restore")
    assert client.get(f"/api/v1/engagements/{eid}/pages/{b['id']}").json()["parent_id"] is None


def test_reorder_atomic_on_conflict(client: TestClient) -> None:
    eid = engagement(client)
    a = create_task(client, eid, "A")
    b = create_task(client, eid, "B")
    url = f"/api/v1/engagements/{eid}/tasks"
    response = client.post(
        url + "/reorder", json={"items": [{"id": b["id"], "revision": 1}, {"id": a["id"], "revision": 99}]}
    )
    assert response.status_code == 409
    assert [p["task"]["position"] for p in client.get(url).json()["items"]] == [0, 1]


def test_subtask_cycles_and_links(client: TestClient) -> None:
    eid = engagement(client)
    p = create_page(client, eid)
    a = create_task(client, eid, "A", related_page_id=p["id"])
    b = create_task(client, eid, "B", parent_task_id=a["id"])
    assert (
        client.patch(
            f"/api/v1/engagements/{eid}/tasks/{a['id']}", json={"revision": 1, "parent_task_id": b["id"]}
        ).status_code
        == 422
    )
    assert client.get(f"/api/v1/engagements/{eid}/pages/{p['id']}").json()["page_type"] == "page"


def test_archive_restore_engagement(client: TestClient) -> None:
    eid = engagement(client)
    p = create_page(client, eid)
    assert client.delete(f"/api/v1/engagements/{eid}").status_code == 204
    assert client.get(f"/api/v1/engagements/{eid}/pages/{p['id']}").status_code == 404
    assert client.post(f"/api/v1/engagements/{eid}/restore").status_code == 200
    assert client.get(f"/api/v1/engagements/{eid}/pages/{p['id']}").status_code == 200


def test_noop_save_and_pagination(client: TestClient) -> None:
    eid = engagement(client)
    p = create_page(client, eid, "First")
    create_page(client, eid, "Second")
    assert (
        client.patch(f"/api/v1/engagements/{eid}/pages/{p['id']}", json={"revision": 1, "title": "First"}).json()[
            "revision"
        ]
        == 1
    )
    response = client.get(f"/api/v1/engagements/{eid}/pages?limit=1&offset=1").json()
    assert response["total"] == 2 and len(response["items"]) == 1 and response["items"][0]["title"] == "Second"


def test_migration_preserves_existing_documents_links_and_hierarchy(tmp_path: Path, monkeypatch: Any) -> None:
    from sqlalchemy import create_engine
    from app.models.entities import Engagement, PersonalTask

    url = f"sqlite:///{tmp_path / 'upgrade.db'}"
    monkeypatch.setenv("VAPT_DATABASE_URL", url)
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "2468d1989c60")
    engine = create_engine(url)
    with Session(engine) as db:
        eng = Engagement(name="Keep my data")
        db.add(eng)
        db.flush()
        parent = Page(engagement_id=eng.id, display_id="PAGE-0001", title="Parent", content=DOC)
        db.add(parent)
        db.flush()
        child = Page(engagement_id=eng.id, display_id="PAGE-0002", title="Child", parent_id=parent.id)
        task = Page(engagement_id=eng.id, display_id="TASK-0001", title="Linked task", page_type="task")
        db.add_all([child, task])
        db.flush()
        db.add(PersonalTask(page_id=task.id, related_page_id=parent.id))
        db.add(RecentPage(engagement_id=eng.id, page_id=parent.id))
        ids = (parent.id, child.id, task.id, eng.id)
        db.commit()
    command.upgrade(config, "head")
    command.upgrade(config, "head")
    with Session(engine) as db:
        assert db.get(Page, ids[0]).content == DOC
        assert db.get(Page, ids[1]).parent_id == ids[0]
        assert db.get(PersonalTask, ids[2]).related_page_id == ids[0]
        assert db.get(RecentPage, (ids[3], ids[0])) is not None
        assert db.execute(text("PRAGMA foreign_key_check")).all() == []
    command.downgrade(config, "2468d1989c60")
    command.upgrade(config, "head")
    with Session(engine) as db:
        assert db.get(Page, ids[0]).content == DOC


def test_legacy_journals_are_recoverable_but_hidden(client: TestClient) -> None:
    eid = engagement(client)
    p = create_page(client, eid, "Journal 2026-10-14", page_type="journal", journal_date="2026-10-14")
    assert (
        client.post(
            f"/api/v1/engagements/{eid}/pages", json={"title": "Bad journal", "page_type": "journal"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"/api/v1/engagements/{eid}/pages",
            json={"title": "Duplicate", "page_type": "journal", "journal_date": "2026-10-14"},
        ).status_code
        == 409
    )
    create_page(client, eid, "Journal 2026-10-15", page_type="journal", journal_date="2026-10-15")
    client.patch(f"/api/v1/engagements/{eid}/pages/{p['id']}", json={"revision": 1, "favorite": True})
    favorites = client.get(f"/api/v1/engagements/{eid}/pages?favorite=true").json()["items"]
    assert favorites == []
    assert client.get(f"/api/v1/engagements/{eid}/pages?q=10-14").json()["items"] == []
    assert client.get(f"/api/v1/engagements/{eid}/pages/{p['id']}").json()["id"] == p["id"]
    assert client.get(f"/api/v1/engagements/{eid}/recent").json() == []
    client.delete(f"/api/v1/engagements/{eid}/pages/{p['id']}")
    assert client.get(f"/api/v1/engagements/{eid}/pages?favorite=true").json()["items"] == []


def test_page_cross_engagement_parent_and_revision_scoping(client: TestClient) -> None:
    one, two = engagement(client, "One"), engagement(client, "Two")
    a, b = create_page(client, one, "A"), create_page(client, two, "B")
    assert (
        client.post(
            f"/api/v1/engagements/{one}/pages", json={"title": "Foreign parent", "parent_id": b["id"]}
        ).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/engagements/{one}/pages/{a['id']}", json={"revision": 1, "parent_id": b["id"]}
        ).status_code
        == 404
    )
    assert client.get(f"/api/v1/engagements/{two}/pages/{a['id']}").status_code == 404
    assert (
        client.patch(f"/api/v1/engagements/{two}/pages/{a['id']}", json={"revision": 1, "content": DOC}).status_code
        == 404
    )
