from pathlib import Path
from runpy import run_path
import json

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