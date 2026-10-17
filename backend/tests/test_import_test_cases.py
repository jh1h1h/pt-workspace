from pathlib import Path
from runpy import run_path
import json
import sys

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker
from test_phase1 import engagement


ROOT = Path(__file__).resolve().parents[2]
IMPORTER = run_path(str(ROOT / "scripts" / "import_test_cases.py"))


def test_test_case_replacement_is_scoped_and_includes_trash(
    client: TestClient, database: sessionmaker[Session]
) -> None:
    eid = engagement(client, "Replace cases")
    other_eid = engagement(client, "Keep other engagement")
    prefix = f"/api/v1/engagements/{eid}"
    first = client.post(f"{prefix}/test-cases", json={"title": "Old active case"}).json()
    second = client.post(f"{prefix}/test-cases", json={"title": "Old trashed case"}).json()
    note = client.post(f"{prefix}/pages", json={"title": "Keep my note"}).json()
    other = client.post(
        f"/api/v1/engagements/{other_eid}/test-cases", json={"title": "Keep other case"}
    ).json()
    note = client.get(f"{prefix}/pages/{note['id']}").json()
    other = client.get(f"/api/v1/engagements/{other_eid}/test-cases/{other['id']}").json()
    assert client.delete(f"{prefix}/test-cases/{second['id']}").status_code == 204

    preview = client.get(f"{prefix}/test-cases/purge-preview")
    assert preview.status_code == 200, preview.text
    assert preview.json()["count"] == 2
    assert client.get(f"{prefix}/test-cases").json()["total"] == 1
    response = client.post(f"{prefix}/test-cases/replace", json={
        "confirmation": preview.json()["confirmation"],
        "cases": [{"title": "Replacement case", "priority": "P1"}],
    })
    assert response.status_code == 200, response.text
    assert response.json()["purged"] == 2
    replacement = response.json()["created"][0]
    assert replacement["record"]["priority"] == "P1"
    assert int(replacement["display_id"].split("-")[1]) > int(second["display_id"].split("-")[1])
    assert client.get(f"{prefix}/test-cases").json()["total"] == 1
    assert client.get(f"{prefix}/test-cases?deleted=true").json()["total"] == 0
    for removed in (first, second):
        assert client.get(f"{prefix}/pages/{removed['id']}").status_code == 404
        assert client.post(f"{prefix}/pages/{removed['id']}/restore").status_code == 404
    assert client.get(f"{prefix}/pages/{note['id']}").json() == note
    assert client.get(f"/api/v1/engagements/{other_eid}/test-cases/{other['id']}").json() == other
    with database() as session:
        assert session.execute(text("PRAGMA foreign_key_check")).all() == []
        for removed in (first, second):
            assert session.execute(text("SELECT count(*) FROM test_cases WHERE page_id=:pid"), {"pid": removed["id"]}).scalar() == 0
            assert session.execute(text("SELECT count(*) FROM page_search WHERE page_id=:pid"), {"pid": removed["id"]}).scalar() == 0


def test_test_case_replacement_removes_only_owned_metadata(
    client: TestClient, database: sessionmaker[Session]
) -> None:
    from app.models.records import CustomPropertyDefinition, CustomPropertyValue, DocumentLink

    eid = engagement(client)
    prefix = f"/api/v1/engagements/{eid}"
    original = client.post(f"{prefix}/test-cases", json={"title": "Remove my metadata"}).json()
    finding = client.post(f"{prefix}/findings", json={"title": "Keep finding"}).json()
    assert client.post(f"{prefix}/relationships", json={
        "source_id": original["id"], "target_id": finding["id"], "relationship_type": "related_to",
    }).status_code == 201
    assert client.post(f"{prefix}/pages/{original['id']}/open").status_code == 204
    with database() as session:
        definition = CustomPropertyDefinition(engagement_id=eid, record_type="test_case", name="Keep definition", data_type="text")
        session.add(definition)
        session.flush()
        session.add(CustomPropertyValue(engagement_id=eid, record_id=original["id"], property_id=definition.id, value="Remove case value"))
        session.add(DocumentLink(engagement_id=eid, source_id=finding["id"], target_id=original["id"], origin="wiki"))
        session.commit()
    finding_before = client.get(f"{prefix}/findings/{finding['id']}").json()
    preview = client.get(f"{prefix}/test-cases/purge-preview").json()
    response = client.post(f"{prefix}/test-cases/replace", json={
        "confirmation": preview["confirmation"], "cases": [{"title": "Fresh case"}],
    })
    assert response.status_code == 200, response.text
    assert client.get(f"{prefix}/findings/{finding['id']}").json() == finding_before
    with database() as session:
        assert session.execute(text("PRAGMA foreign_key_check")).all() == []
        for table in ("recent_pages", "record_relationships", "document_links", "custom_property_values"):
            assert session.execute(text(f"SELECT count(*) FROM {table}")).scalar() == 0
        assert session.execute(text("SELECT count(*) FROM custom_property_definitions")).scalar() == 1


@pytest.mark.parametrize("dependency", ["child", "task", "import", "relation-value", "relation-default", "relation-default-single"])
def test_test_case_replacement_blocks_preserved_dependencies(
    client: TestClient, database: sessionmaker[Session], dependency: str,
) -> None:
    from app.models.entities import Page, PersonalTask
    from app.models.records import CustomPropertyDefinition, CustomPropertyValue, ImportEntry, ImportJob

    eid = engagement(client)
    prefix = f"/api/v1/engagements/{eid}"
    original = client.post(f"{prefix}/test-cases", json={"title": "Referenced case"}).json()
    preview = client.get(f"{prefix}/test-cases/purge-preview").json()
    note = client.post(f"{prefix}/pages", json={"title": "Preserve unrelated document"}).json()
    if dependency == "task":
        task = client.post(f"{prefix}/tasks", json={"title": "Preserve Personal Task"}).json()
    with database() as session:
        if dependency == "child":
            session.get(Page, note["id"]).parent_id = original["id"]
        elif dependency == "task":
            session.get(PersonalTask, task["id"]).related_page_id = original["id"]
        elif dependency == "import":
            job = ImportJob(engagement_id=eid, format="json", source_filename="fixture.json", source_hash="fixture")
            session.add(job)
            session.flush()
            session.add(ImportEntry(engagement_id=eid, import_id=job.id, record_id=original["id"], fingerprint="fixture", source_row=1))
        else:
            definition = CustomPropertyDefinition(
                engagement_id=eid, record_type="finding", name="Keep relation", data_type="relation",
                default_value=(original["id"] if dependency == "relation-default-single" else
                               [original["id"]] if dependency == "relation-default" else None),
            )
            session.add(definition)
            session.flush()
            if dependency == "relation-value":
                session.add(CustomPropertyValue(engagement_id=eid, record_id=note["id"], property_id=definition.id, value=[original["id"]]))
        session.commit()
    assert client.get(f"{prefix}/test-cases/purge-preview").status_code == 409
    response = client.post(f"{prefix}/test-cases/replace", json={
        "confirmation": preview["confirmation"], "cases": [{"title": "Do not create"}],
    })
    assert response.status_code == 409, response.text
    assert client.get(f"{prefix}/test-cases").json()["items"][0]["id"] == original["id"]
    assert client.get(f"{prefix}/pages/{note['id']}").status_code == 200
    with database() as session:
        assert session.execute(text("PRAGMA foreign_key_check")).all() == []


def test_test_case_replacement_rejects_stale_preview_and_rolls_back(client: TestClient) -> None:
    eid = engagement(client)
    other_eid = engagement(client, "Other")
    prefix = f"/api/v1/engagements/{eid}"
    original = client.post(f"{prefix}/test-cases", json={"title": "Keep on failure"}).json()
    preview = client.get(f"{prefix}/test-cases/purge-preview").json()
    added = client.post(f"{prefix}/test-cases", json={"title": "Concurrent addition"}).json()
    replacement = {"confirmation": preview["confirmation"], "cases": [{"title": "New"}]}
    assert client.post(f"{prefix}/test-cases/replace", json=replacement).status_code == 409
    assert client.get(f"{prefix}/test-cases").json()["total"] == 2
    preview = client.get(f"{prefix}/test-cases/purge-preview").json()
    assert client.patch(f"{prefix}/test-cases/{original['id']}", json={
        "revision": original["revision"], "title": "Edited after preview",
    }).status_code == 200
    replacement["confirmation"] = preview["confirmation"]
    assert client.post(f"{prefix}/test-cases/replace", json=replacement).status_code == 409
    foreign = client.post(f"/api/v1/engagements/{other_eid}/pages", json={"title": "Foreign parent"}).json()
    replacement = {
        "confirmation": client.get(f"{prefix}/test-cases/purge-preview").json()["confirmation"],
        "cases": [{"title": "Would create"}, {"title": "Invalid later case", "parent_id": foreign["id"]}],
    }
    assert client.post(f"{prefix}/test-cases/replace", json=replacement).status_code == 404
    listed = client.get(f"{prefix}/test-cases").json()
    assert {item["id"] for item in listed["items"]} == {original["id"], added["id"]}
    next_case = client.post(f"{prefix}/test-cases", json={"title": "After rollback"}).json()
    assert int(next_case["display_id"].split("-")[1]) == int(added["display_id"].split("-")[1]) + 1


def test_import_purge_invalid_source_never_contacts_api(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str],
) -> None:
    source = tmp_path / "invalid.json"
    source.write_text("[]", encoding="utf-8")

    def unexpected_api(*args: object, **kwargs: object) -> dict:
        pytest.fail("Invalid input must be rejected before any API request")

    monkeypatch.setitem(IMPORTER["main"].__globals__, "api_request", unexpected_api)
    monkeypatch.setattr(sys, "argv", ["import_test_cases.py", str(source), "fixture", "--purge", "--apply"])
    with pytest.raises(SystemExit) as error:
        IMPORTER["main"]()
    assert error.value.code == 1
    assert "nonempty JSON array" in capsys.readouterr().err


@pytest.mark.parametrize("apply", [False, True])
def test_import_purge_preview_and_apply_use_real_api(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str], apply: bool,
) -> None:
    eid = engagement(client)
    prefix = f"/api/v1/engagements/{eid}"
    original = client.post(f"{prefix}/test-cases", json={"title": "Same title"}).json()
    source = tmp_path / "replacement.json"
    source.write_text(json.dumps([{
        "title": "Same title", "category": "Updated procedure", "priority": "P1",
        "prerequisites": ["Approved fixture."], "actions": ["Open Burp Repeater.", "Click Send."],
        "expected": ["Access denied."], "finding_condition": ["Unauthorized access."], "evidence": ["Redacted result."],
    }]), encoding="utf-8")
    requests = []

    def real_api(_base: str, path: str, payload: dict | None = None) -> dict:
        requests.append((path, payload))
        response = client.post(path, json=payload) if payload is not None else client.get(path)
        assert response.status_code in {200, 201}, response.text
        return response.json()

    monkeypatch.setitem(IMPORTER["main"].__globals__, "api_request", real_api)
    monkeypatch.setattr(sys, "argv", ["import_test_cases.py", str(source), eid, "--purge", *(["--apply"] if apply else [])])
    IMPORTER["main"]()
    listed = client.get(f"{prefix}/test-cases").json()
    assert listed["total"] == 1
    current = listed["items"][0]
    if apply:
        assert current["id"] != original["id"]
        assert current["record"]["category"] == "Updated procedure"
        assert "Purged 1; created 1 in one transaction" in capsys.readouterr().out
        assert [path for path, payload in requests if payload is not None] == [f"{prefix}/test-cases/replace"]
    else:
        assert current["id"] == original["id"]
        assert "Nothing deleted or imported" in capsys.readouterr().out
        assert all(payload is None for path, payload in requests)


def test_login_checklist_creates_real_test_cases(client: TestClient, tmp_path: Path) -> None:
    eid = engagement(client)
    source = tmp_path / "cases.json"
    source.write_text(json.dumps([{
        "title": "Fixture login correlation",
        "category": "Authentication",
        "prerequisites": ["Use an approved fixture."],
        "actions": ["Start an application login.", "Compare independent attempts."],
        "expected": ["The attempts remain independent."],
        "finding_condition": ["A mismatched attempt authenticates another user."],
        "evidence": ["Keep redacted outcomes only."],
    }]), encoding="utf-8")
    cases = IMPORTER["load_cases"](source)
    for case in cases:
        response = client.post(
            f"/api/v1/engagements/{eid}/test-cases",
            json={
                "title": case["title"],
                "category": case["category"],
                "content": IMPORTER["document"](case),
                "execution_status": "Not Started",
                "assessment_outcome": "Not Assessed",
            },
        )
        assert response.status_code == 201, response.text
        assert response.json()["content"]["content"][0]["content"][0]["text"] == "Prerequisites"
        assert response.json()["record"]["assessment_outcome"] == "Not Assessed"

    listing = client.get(f"/api/v1/engagements/{eid}/test-cases?limit=200")
    assert listing.status_code == 200
    assert listing.json()["total"] == len(cases)
    assert {item["title"] for item in listing.json()["items"]} == {case["title"] for case in cases}


def test_login_checklist_priorities_must_be_complete_and_sorted(tmp_path: Path) -> None:
    source = tmp_path / "cases.json"
    base = {
        "category": "Authentication",
        "prerequisites": ["Approved fixture."],
        "actions": ["Check the application."],
        "expected": ["Access is denied."],
        "finding_condition": ["Unauthorized access is confirmed."],
        "evidence": ["Redacted status."],
    }
    high = {**base, "title": "High priority", "priority": "P1"}
    medium = {**base, "title": "Medium priority", "priority": "P12"}
    source.write_text(json.dumps([high, medium]), encoding="utf-8")
    assert [case["priority"] for case in IMPORTER["load_cases"](source)] == ["P1", "P12"]

    source.write_text(json.dumps([medium, high]), encoding="utf-8")
    assert [case["priority"] for case in IMPORTER["load_cases"](source)] == ["P1", "P12"]

    for cases, error in [([high, {**medium, "priority": "P0"}], "priority must"),
                         ([high, {key: value for key, value in medium.items() if key != "priority"}], "All cases")]:
        source.write_text(json.dumps(cases), encoding="utf-8")
        with pytest.raises(ValueError, match=error):
            IMPORTER["load_cases"](source)


def test_import_rejects_stale_api_before_creating_cases(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    source = tmp_path / "cases.json"
    source.write_text(json.dumps([{
        "title": "Fixture login correlation",
        "category": "Login CSRF",
        "priority": "P1",
        "prerequisites": ["Approved fixture."],
        "actions": ["Check the callback."],
        "expected": ["Access is denied."],
        "finding_condition": ["An unrelated attempt authenticates."],
        "evidence": ["Redacted status."],
    }]), encoding="utf-8")
    requests = []

    def stale_api(_base: str, path: str, payload: dict | None = None) -> dict:
        requests.append((path, payload))
        return {"components": {"schemas": {"TestCreate": {"properties": {"category": {}}}}}}

    monkeypatch.setitem(IMPORTER["main"].__globals__, "api_request", stale_api)
    monkeypatch.setattr(sys, "argv", ["import_test_cases.py", str(source), "fixture", "--apply"])
    with pytest.raises(SystemExit) as error:
        IMPORTER["main"]()
    assert error.value.code == 1
    assert "does not support Test Case priority" in capsys.readouterr().err
    assert requests == [("/openapi.json", None)]


def test_login_checklist_import_persists_priority(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    eid = engagement(client)
    source = tmp_path / "cases.json"
    source.write_text(json.dumps([{
        "title": "Fixture HQ gate",
        "category": "Authentication",
        "priority": "P1",
        "prerequisites": ["Use an approved fixture."],
        "actions": ["Check an HQ resource before OTP."],
        "expected": ["Access is denied."],
        "finding_condition": ["Protected access succeeds before OTP."],
        "evidence": ["Redacted result."],
    }]), encoding="utf-8")

    def real_api(_base: str, path: str, payload: dict | None = None) -> dict:
        response = client.post(path, json=payload) if payload is not None else client.get(path)
        assert response.status_code in {200, 201}, response.text
        return response.json()

    monkeypatch.setitem(IMPORTER["main"].__globals__, "api_request", real_api)
    monkeypatch.setattr(sys, "argv", ["import_test_cases.py", str(source), eid, "--apply"])
    IMPORTER["main"]()
    listed = client.get(f"/api/v1/engagements/{eid}/test-cases?priority=P1").json()
    assert listed["total"] == 1
    assert listed["items"][0]["record"]["priority"] == "P1"


def test_engagement_name_resolution_uses_real_paginated_api(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def real_api(_base: str, path: str) -> dict:
        response = client.get(path)
        assert response.status_code == 200, response.text
        return response.json()

    monkeypatch.setitem(IMPORTER["resolve_engagement"].__globals__, "api_request", real_api)
    resolve = IMPORTER["resolve_engagement"]
    first_id = engagement(client, "First engagement")
    assert resolve("http://127.0.0.1:8000", first_id)["id"] == first_id
    assert resolve("http://127.0.0.1:8000", "First engagement")["id"] == first_id
    with pytest.raises(ValueError, match="No active engagement"):
        resolve("http://127.0.0.1:8000", "first engagement")

    for _ in range(199):
        engagement(client, "Other engagement")
    last_id = engagement(client, "Beyond first page")
    assert resolve("http://127.0.0.1:8000", "Beyond first page")["id"] == last_id
    engagement(client, "First engagement")
    with pytest.raises(ValueError, match="Multiple active engagements"):
        resolve("http://127.0.0.1:8000", "First engagement")