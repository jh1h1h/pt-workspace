from pathlib import Path
from runpy import run_path
import json
import sys

from fastapi.testclient import TestClient
import pytest
from test_phase1 import engagement


ROOT = Path(__file__).resolve().parents[2]
IMPORTER = run_path(str(ROOT / "scripts" / "import_test_cases.py"))


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
    medium = {**base, "title": "Medium priority", "priority": "P2"}
    source.write_text(json.dumps([high, medium]), encoding="utf-8")
    assert [case["priority"] for case in IMPORTER["load_cases"](source)] == ["P1", "P2"]

    for cases, error in [([medium, high], "ordered"), ([high, {**medium, "priority": "P4"}], "priority must"),
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