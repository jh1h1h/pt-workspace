from pathlib import Path
from typing import Any
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session
from app.models.entities import Engagement, Page, PersonalTask, RecentPage
from app.models.records import RecordRegistry, RecordRelationship
from test_phase1 import engagement, create_task, DOC

PATHS = {
    "asset": "assets",
    "surface": "attack-surfaces",
    "backlog": "backlog",
    "test_case": "test-cases",
    "finding": "findings",
    "evidence": "evidence",
    "scope": "scope-pages",
    "observation": "observations",
    "template": "templates",
}


def create(client: TestClient, eid: str, kind: str = "asset", title: str = "Record", **fields: Any) -> dict:
    response = client.post(f"/api/v1/engagements/{eid}/{PATHS[kind]}", json={"title": title, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def update(client: TestClient, p: dict, **fields: Any) -> dict:
    response = client.patch(
        f"/api/v1/engagements/{p['engagement_id']}/{PATHS[p['record']['kind']]}/{p['id']}",
        json={"revision": p["revision"], **fields},
    )
    assert response.status_code == 200, response.text
    return response.json()


def link(client: TestClient, eid: str, source: dict, target: dict) -> dict:
    response = client.post(
        f"/api/v1/engagements/{eid}/relationships", json={"source_id": source["id"], "target_id": target["id"]}
    )
    assert response.status_code == 201, response.text
    return response.json()


def relations(client: TestClient, eid: str, p: dict) -> list:
    response = client.get(f"/api/v1/engagements/{eid}/records/{p['id']}/relationships")
    assert response.status_code == 200, response.text
    return response.json()


def test_P2_B01_all_record_types_create_update(client: TestClient) -> None:
    eid = engagement(client)
    for kind, field, value in [
        ("asset", "environment", "Staging"),
        ("surface", "status", "Reviewed"),
        ("backlog", "priority", "P1"),
        ("test_case", "assessment_outcome", "Inconclusive"),
        ("finding", "severity", "High"),
        ("evidence", "source_reference", "Passive reference"),
        ("scope", "section", "Written scope"),
    ]:
        p = create(client, eid, kind, kind)
        updated = update(client, p, **{field: value}, content=DOC)
        assert updated["record"][field] == value
        assert updated["content"] == DOC
        assert updated["revision"] == 2


def test_P2_B02_stable_unique_ids(client: TestClient) -> None:
    eid = engagement(client)
    records = [create(client, eid, k, k) for k in ["asset", "surface", "backlog", "test_case", "finding"]]
    assert len({p["id"] for p in records}) == 5
    assert [p["display_id"] for p in records] == ["AST-0001", "SURF-0001", "BLG-0001", "TST-0001", "FND-0001"]
    for p in records:
        renamed = update(client, p, title="Renamed")
        assert (renamed["id"], renamed["display_id"]) == (p["id"], p["display_id"])


def test_P2_B03_two_engagements_isolated(client: TestClient) -> None:
    one, two = engagement(client, "One"), engagement(client, "Two")
    for kind in ["asset", "surface", "backlog", "test_case", "finding", "evidence"]:
        p = create(client, one, kind)
        path = f"/api/v1/engagements/{two}/{PATHS[kind]}"
        assert client.get(path).json()["items"] == []
        assert client.get(path + "/" + p["id"]).status_code == 404
        assert client.patch(path + "/" + p["id"], json={"revision": 1, "title": "Foreign"}).status_code == 404


def test_P2_B04_invalid_relations_and_atomic_create(client: TestClient) -> None:
    one, two = engagement(client, "One"), engagement(client, "Two")
    a = create(client, one)
    b = create(client, two)
    for target in [b["id"], "00000000-0000-0000-0000-000000000000"]:
        assert (
            client.post(
                f"/api/v1/engagements/{one}/relationships", json={"source_id": a["id"], "target_id": target}
            ).status_code
            == 404
        )
        assert (
            client.post(
                f"/api/v1/engagements/{one}/backlog",
                json={"title": "Invalid linked creation", "links": [{"target_id": target}]},
            ).status_code
            == 404
        )
    assert client.get(f"/api/v1/engagements/{one}/backlog").json()["total"] == 0
    surface = create(client, one, "surface")
    assert (
        client.post(
            f"/api/v1/engagements/{two}/observations",
            json={
                "title": "Foreign observation",
                "surface_id": surface["id"],
                "classification": "Observed",
                "discovery_source": "browser",
            },
        ).status_code
        == 404
    )


def test_P2_B05_multiple_discovery_classifications(client: TestClient) -> None:
    eid = engagement(client)
    surface = create(client, eid, "surface")
    for c in ["Inferred", "Advertised", "Observed"]:
        create(
            client,
            eid,
            "observation",
            c,
            surface_id=surface["id"],
            classification=c,
            discovery_source="manual",
            content=DOC,
        )
    items = client.get(f"/api/v1/engagements/{eid}/observations?surface_id={surface['id']}").json()["items"]
    assert {p["record"]["classification"] for p in items} == {"Inferred", "Advertised", "Observed"}
    assert all(p["content"] == DOC for p in items)


def test_P2_B06_observed_does_not_replace_inferred(client: TestClient) -> None:
    eid = engagement(client)
    surface = create(client, eid, "surface")
    first = create(
        client,
        eid,
        "observation",
        "Inferred",
        surface_id=surface["id"],
        classification="Inferred",
        discovery_source="JavaScript",
        source_reference="bundle.js",
    )
    create(
        client,
        eid,
        "observation",
        "Observed",
        surface_id=surface["id"],
        classification="Observed",
        discovery_source="browser",
    )
    first = update(client, first, content=DOC)
    assert first["record"]["classification"] == "Inferred"
    assert (
        client.patch(
            f"/api/v1/engagements/{eid}/observations/{first['id']}",
            json={"revision": first["revision"], "classification": "Observed"},
        ).status_code
        == 422
    )
    assert client.get(f"/api/v1/engagements/{eid}/observations").json()["total"] == 2


def test_P2_B07_methods_context_duplicates_preserved(client: TestClient) -> None:
    eid = engagement(client)
    get = create(
        client,
        eid,
        "surface",
        "GET",
        url_route="https://EXAMPLE.test/login#one",
        http_method="GET",
        authentication_state="anonymous",
    )
    post = create(
        client,
        eid,
        "surface",
        "POST",
        url_route="https://example.test/login",
        http_method="POST",
        authentication_state="anonymous",
    )
    authenticated = create(
        client,
        eid,
        "surface",
        "Authenticated",
        url_route="https://example.test/login",
        http_method="GET",
        authentication_state="signed in",
    )
    same = create(
        client,
        eid,
        "surface",
        "Possible duplicate",
        url_route="https://example.test/login#two",
        http_method="GET",
        authentication_state="anonymous",
    )
    assert get["id"] in same["record"]["duplicate_ids"]
    assert (
        post["id"] not in same["record"]["duplicate_ids"] and authenticated["id"] not in same["record"]["duplicate_ids"]
    )
    assert client.get(f"/api/v1/engagements/{eid}/attack-surfaces").json()["total"] == 4


def test_P2_B08_backlog_links_two_surfaces(client: TestClient) -> None:
    eid = engagement(client)
    a = create(client, eid, "surface", "A")
    b = create(client, eid, "surface", "B")
    p = create(client, eid, "backlog", links=[{"target_id": a["id"]}, {"target_id": b["id"]}])
    assert {r["target"]["id"] for r in relations(client, eid, p)} == {a["id"], b["id"]}


def test_P2_B09_personal_backlog_separate_models(client: TestClient) -> None:
    eid = engagement(client)
    backlog = create(client, eid, "backlog", "Technical objective", priority="P1")
    task = create_task(client, eid, "Personal reminder", related_page_id=backlog["id"])
    assert client.get(f"/api/v1/engagements/{eid}/tasks").json()["items"][0]["id"] == task["id"]
    assert backlog["id"] != task["id"] and backlog["record"]["status"] == "Queued" and task["task"]["status"] == "Open"
    assert relations(client, eid, backlog)[0]["source"]["id"] == task["id"]


def test_P2_B10_completion_has_no_cascades(client: TestClient) -> None:
    eid = engagement(client)
    backlog = create(client, eid, "backlog")
    test = create(client, eid, "test_case", links=[{"target_id": backlog["id"]}])
    task = create_task(client, eid, related_page_id=backlog["id"])
    client.patch(f"/api/v1/engagements/{eid}/tasks/{task['id']}", json={"revision": 1, "status": "Done"})
    assert client.get(f"/api/v1/engagements/{eid}/backlog/{backlog['id']}").json()["record"]["status"] == "Queued"
    assert (
        client.get(f"/api/v1/engagements/{eid}/test-cases/{test['id']}").json()["record"]["execution_status"]
        == "Not Started"
    )
    update(client, backlog, status="Completed")
    assert (
        client.get(f"/api/v1/engagements/{eid}/test-cases/{test['id']}").json()["record"]["execution_status"]
        == "Not Started"
    )


def test_P2_B11_completed_inconclusive_test(client: TestClient) -> None:
    eid = engagement(client)
    p = create(client, eid, "test_case")
    p = update(client, p, execution_status="Completed", assessment_outcome="Inconclusive")
    assert p["record"]["execution_status"] == "Completed" and p["record"]["assessment_outcome"] == "Inconclusive"


def test_P2_B12_blocked_is_not_success(client: TestClient) -> None:
    eid = engagement(client)
    p = create(client, eid, "test_case")
    p = update(client, p, execution_status="Blocked")
    assert p["record"]["assessment_outcome"] == "Not Assessed"


def test_P2_B13_candidate_defaults_and_severity_independence(client: TestClient) -> None:
    eid = engagement(client)
    p = create(client, eid, "finding")
    assert (
        p["record"]["validation_status"] == "Candidate"
        and p["record"]["severity"] == "Unassigned"
        and p["record"]["verified_at"] is None
    )
    assert update(client, p, severity="Critical")["record"]["validation_status"] == "Candidate"


def test_P2_B14_finding_lifecycle_requires_verification(client: TestClient) -> None:
    eid = engagement(client)
    p = create(client, eid, "finding")
    url = f"/api/v1/engagements/{eid}/findings/{p['id']}"
    for state in ["Confirmed", "Report Ready"]:
        assert client.patch(url, json={"revision": p["revision"], "validation_status": state}).status_code == 422
    assert (
        client.post(
            url + "/verify", json={"revision": p["revision"], "verification_note": "Explicit review"}
        ).status_code
        == 422
    )
    p = update(client, p, validation_status="Validating")
    response = client.post(
        url + "/verify",
        json={"revision": p["revision"], "verification_note": "Manually verified against retained evidence"},
    )
    assert response.status_code == 200, response.text
    p = response.json()
    assert p["record"]["verified_at"] is not None
    p = update(client, p, validation_status="Report Ready")
    assert p["record"]["validation_status"] == "Report Ready"
    p = update(client, p, validation_status="Validating")
    assert p["record"]["verified_at"] is None
    assert client.patch(url, json={"revision": p["revision"], "validation_status": "Report Ready"}).status_code == 422


def test_P2_B15_bidirectional_relationship_add_remove(client: TestClient) -> None:
    eid = engagement(client)
    a = create(client, eid)
    b = create(client, eid, "surface")
    r = link(client, eid, a, b)
    assert relations(client, eid, a)[0]["direction"] == "outgoing"
    assert relations(client, eid, b)[0]["direction"] == "incoming"
    assert len(client.get(f"/api/v1/engagements/{eid}/records/{b['id']}/backlinks").json()) == 1
    assert client.delete(f"/api/v1/engagements/{eid}/relationships/{r['id']}").status_code == 204
    assert relations(client, eid, a) == [] and relations(client, eid, b) == []


def test_P2_B16_rename_keeps_links(client: TestClient) -> None:
    eid = engagement(client)
    a = create(client, eid)
    b = create(client, eid, "surface")
    r = link(client, eid, a, b)
    b = update(client, b, title="Renamed surface")
    result = relations(client, eid, a)[0]
    assert (
        result["id"] == r["id"] and result["target"]["id"] == b["id"] and result["target"]["title"] == "Renamed surface"
    )


def test_P2_B17_reverse_duplicate_prevented(client: TestClient) -> None:
    eid = engagement(client)
    a = create(client, eid)
    b = create(client, eid, "surface")
    link(client, eid, a, b)
    for source, target in [(a, b), (b, a)]:
        assert (
            client.post(
                f"/api/v1/engagements/{eid}/relationships", json={"source_id": source["id"], "target_id": target["id"]}
            ).status_code
            == 409
        )
    assert len(relations(client, eid, a)) == 1


def test_P2_B18_pagination_filters_sort(client: TestClient) -> None:
    eid = engagement(client)
    for title, priority in [("Alpha", "P1"), ("Beta", "P2"), ("Gamma", "P1")]:
        create(client, eid, "backlog", title, priority=priority)
    data = client.get(f"/api/v1/engagements/{eid}/backlog?priority=P1&sort=title&direction=desc&limit=1").json()
    assert data["total"] == 2 and data["items"][0]["title"] == "Gamma"
    assert (
        client.get(f"/api/v1/engagements/{eid}/backlog?priority=P1&sort=title&direction=desc&limit=1&offset=1").json()[
            "items"
        ][0]["title"]
        == "Alpha"
    )
    assert client.get(f"/api/v1/engagements/{eid}/backlog?filter_field=unknown&filter_value=x").status_code == 422
    assert client.get(f"/api/v1/engagements/{eid}/backlog?sort=DROP%20TABLE").status_code == 422


def test_test_case_priority_create_update_filter_sort(client: TestClient) -> None:
    eid = engagement(client)
    base = f"/api/v1/engagements/{eid}/test-cases"
    medium = create(client, eid, "test_case", "Medium")
    low = create(client, eid, "test_case", "Low", priority="P3")
    later = create(client, eid, "test_case", "Later", priority="P12")
    high = create(client, eid, "test_case", "High", priority="P1")
    alpha_high = create(client, eid, "test_case", "Alpha high", priority="P1")
    assert medium["record"]["priority"] == "P2"
    assert client.get(f"{base}?sort=priority").json()["items"][0]["record"]["priority"] == "P1"
    assert [item["record"]["priority"] for item in client.get(f"{base}?sort=priority&direction=desc").json()["items"]] == ["P12", "P3", "P2", "P1", "P1"]
    assert [item["title"] for item in client.get(f"{base}?sort=priority&secondary_sort=title&secondary_direction=desc").json()["items"][:2]] == ["High", "Alpha high"]
    assert {item["id"] for item in client.get(f"{base}?priority=P1").json()["items"]} == {high["id"], alpha_high["id"]}
    assert [item["id"] for item in client.get(f'{base}?filters={{"priority":"P3"}}').json()["items"]] == [low["id"]]
    assert update(client, medium, priority="P1")["record"]["priority"] == "P1"
    assert client.get(f"{base}/{medium['id']}").json()["record"]["priority"] == "P1"
    assert client.get(f"{base}?secondary_sort=DROP%20TABLE").status_code == 422
    assert client.post(base, json={"title": "Invalid", "priority": "P0"}).status_code == 422
    assert client.post(base, json={"title": "Invalid", "priority": "P100000"}).status_code == 422
    assert later["record"]["priority"] == "P12"


def test_P2_B19_phase1_migration_preserves_every_row(tmp_path: Path, monkeypatch: Any) -> None:
    url = f"sqlite:///{tmp_path / 'phase1.db'}"
    monkeypatch.setenv("VAPT_DATABASE_URL", url)
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "8e123f72c001")
    engine = create_engine(url)
    with Session(engine) as db:
        eng = Engagement(name="Existing assessment")
        db.add(eng)
        db.flush()
        note = Page(engagement_id=eng.id, display_id="PAGE-0001", title="Existing", content=DOC, favorite=True)
        db.add(note)
        db.flush()
        task = Page(engagement_id=eng.id, display_id="TASK-0001", title="Reminder", page_type="task", parent_id=note.id)
        db.add(task)
        db.flush()
        db.add(PersonalTask(page_id=task.id, related_page_id=note.id, status="In Progress", priority="P1"))
        db.add(RecentPage(engagement_id=eng.id, page_id=note.id))
        ids = (eng.id, note.id, task.id)
        db.commit()
    with engine.connect() as connection:
        original = {
            table: connection.execute(text(f"SELECT * FROM {table} ORDER BY 1")).all()
            for table in ["engagements", "pages", "personal_tasks", "recent_pages"]
        }
    command.upgrade(config, "head")
    command.upgrade(config, "head")
    with engine.connect() as connection:
        for table, rows in original.items():
            assert connection.execute(text(f"SELECT * FROM {table} ORDER BY 1")).all() == rows
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    with Session(engine) as db:
        assert db.get(RecordRegistry, ids[1]).kind == "page"
        assert db.scalar(select(RecordRelationship).where(RecordRelationship.source_id == ids[2])).target_id == ids[1]


def test_P2_B20_soft_delete_restore_retains_links(client: TestClient) -> None:
    eid = engagement(client)
    a = create(client, eid)
    b = create(client, eid, "surface")
    r = link(client, eid, a, b)
    url = f"/api/v1/engagements/{eid}/attack-surfaces/{b['id']}"
    assert client.delete(url).status_code == 204
    assert relations(client, eid, a)[0]["target"]["deleted"] is True
    assert client.get(url).status_code == 404
    assert client.post(url + "/restore").status_code == 200
    assert relations(client, eid, a)[0]["id"] == r["id"] and relations(client, eid, a)[0]["target"]["deleted"] is False


def test_templates_authorization_and_blocker_validation(client: TestClient) -> None:
    eid = engagement(client)
    assert (
        client.post(
            f"/api/v1/engagements/{eid}/assets", json={"name": "Discovered", "scope_state": "In Scope"}
        ).status_code
        == 422
    )
    approved = create(client, eid, "asset", scope_state="In Scope", authorization_confirmed=True)
    assert approved["record"]["authorization_confirmed"] is True
    assert (
        client.post(f"/api/v1/engagements/{eid}/backlog", json={"title": "Blocked", "status": "Blocked"}).status_code
        == 422
    )
    template = create(
        client, eid, "template", "My test template", record_type="test_case", is_default=True, content=DOC
    )
    test = create(client, eid, "test_case", template_id=template["id"])
    assert test["content"] == DOC
    assert create(client, eid, "test_case")["content"] == DOC
    assert client.post(f"/api/v1/engagements/{eid}/scope-pages/initialize").status_code == 200
    assert client.post(f"/api/v1/engagements/{eid}/scope-pages/initialize").json() == []
    assert client.get(f"/api/v1/engagements/{eid}/scope-pages").json()["total"] == 9
