import hashlib
import json
from pathlib import Path
from typing import Any
from fastapi.testclient import TestClient
from test_phase1 import engagement, DOC
from test_phase2 import create, update, link, relations


def property_create(client: TestClient, eid: str, kind: str, name: str, data_type: str, **extra: Any) -> dict:
    response = client.post(f"/api/v1/engagements/{eid}/custom-properties", json={"record_type": kind, "name": name, "data_type": data_type, **extra})
    assert response.status_code == 201, response.text
    return response.json()


def test_P3_C01_C03_all_custom_property_types_and_stable_rename(client: TestClient) -> None:
    eid = engagement(client)
    asset = create(client, eid, "asset", "Target")
    cases = [
        ("text", "hello", {}), ("number", 4.5, {}), ("checkbox", True, {}),
        ("date", "2026-10-14", {}), ("single_select", "A", {"allowed_values": ["A", "B"]}),
        ("multi_select", ["A", "B"], {"allowed_values": ["A", "B"]}),
        ("url", "https://example.test/path", {}), ("relation", [asset["id"]], {}),
    ]
    for position, (kind, value, extra) in enumerate(cases):
        definition = property_create(client, eid, "asset", f"Field {kind}", kind, display_order=position, **extra)
        response = client.put(f"/api/v1/engagements/{eid}/records/{asset['id']}/custom-values/{definition['id']}", json={"value": value})
        assert response.status_code == 200, response.text
        renamed = client.patch(f"/api/v1/engagements/{eid}/custom-properties/{definition['id']}", json={"name": f"Renamed {kind}"})
        assert renamed.status_code == 200 and renamed.json()["id"] == definition["id"]
    values = client.get(f"/api/v1/engagements/{eid}/records/{asset['id']}/custom-values").json()
    assert len(values) == 8 and {item["definition"]["name"] for item in values} == {f"Renamed {case[0]}" for case in cases}


def test_P3_C02_invalid_values_and_cross_engagement_relations(client: TestClient) -> None:
    one, two = engagement(client, "One"), engagement(client, "Two")
    asset = create(client, one, "asset")
    foreign = create(client, two, "asset")
    cases = [("number", "nope", {}), ("date", "14/10/2026", {}), ("single_select", "X", {"allowed_values": ["A"]}), ("url", "javascript:alert(1)", {}), ("relation", [foreign["id"]], {})]
    for index, (kind, value, extra) in enumerate(cases):
        definition = property_create(client, one, "asset", f"Bad {index}", kind, **extra)
        status = client.put(f"/api/v1/engagements/{one}/records/{asset['id']}/custom-values/{definition['id']}", json={"value": value}).status_code
        assert status == (404 if kind == "relation" else 422)


def test_P3_C05_C06_saved_views_persist_and_use_source_records(client: TestClient) -> None:
    eid = engagement(client)
    first = create(client, eid, "surface", "Authentication endpoint")
    view = client.post(f"/api/v1/engagements/{eid}/saved-views", json={"record_type": "surface", "name": "Authentication", "view_type": "table", "is_default": True, "config": {"columns": ["title", "status"], "column_order": ["title", "status"], "column_widths": {"title": 280}, "filters": [{"field": "title", "value": "Authentication"}], "sorts": [{"field": "title", "direction": "asc"}], "group_by": "status"}})
    assert view.status_code == 201, view.text
    view_id = view.json()["id"]
    assert client.get(f"/api/v1/engagements/{eid}/saved-views/{view_id}/records").json()["items"][0]["id"] == first["id"]
    update(client, first, title="Authentication renamed")
    assert client.get(f"/api/v1/engagements/{eid}/saved-views/{view_id}/records").json()["items"][0]["title"] == "Authentication renamed"
    duplicated = client.post(f"/api/v1/engagements/{eid}/saved-views/{view_id}/duplicate")
    assert duplicated.status_code == 201 and duplicated.json()["config"]["column_widths"]["title"] == 280


def test_P3_C07_C08_bulk_update_is_scoped_and_csv_selection(client: TestClient) -> None:
    eid = engagement(client)
    rows = [create(client, eid, "backlog", title) for title in ["A", "B", "C"]]
    response = client.post(f"/api/v1/engagements/{eid}/bulk-update", json={"ids": [rows[0]["id"], rows[1]["id"]], "revisions": {rows[0]["id"]: 1, rows[1]["id"]: 1}, "field": "priority", "value": "P1"})
    assert response.status_code == 200, response.text
    assert create(client, eid, "backlog", "D")["record"]["priority"] == "P2"
    view = client.post(f"/api/v1/engagements/{eid}/saved-views", json={"record_type": "backlog", "name": "All", "config": {}}).json()
    export = client.get(f"/api/v1/engagements/{eid}/saved-views/{view['id']}/export.csv?selected={rows[0]['id']}")
    assert export.status_code == 200 and ",A,backlog," in export.text and ",B,backlog," not in export.text


def test_P3_C09_C10_workflow_labels_keep_canonical_semantics(client: TestClient) -> None:
    eid = engagement(client)
    assert client.post(f"/api/v1/engagements/{eid}/workflow-options", json={"record_type": "finding", "label": "Ship it", "canonical_category": "Report Ready"}).status_code == 201
    assert client.post(f"/api/v1/engagements/{eid}/workflow-options", json={"record_type": "finding", "label": "Bypass", "canonical_category": "Done"}).status_code == 422
    task_option = client.post(f"/api/v1/engagements/{eid}/workflow-options", json={"record_type": "task", "label": "Wrapped", "canonical_category": "Done"}).json()
    task = client.post(f"/api/v1/engagements/{eid}/tasks", json={"title": "Personal"}).json()
    applied = client.put(f"/api/v1/engagements/{eid}/records/{task['id']}/workflow", json={"option_id": task_option["id"], "revision": 1})
    assert applied.status_code == 200 and applied.json()["task"]["status"] == "Done"


def test_P3_T01_T05_structured_links_backlinks_rename_and_origin_safety(client: TestClient) -> None:
    eid = engagement(client)
    source = client.post(f"/api/v1/engagements/{eid}/pages", json={"title": "Source"}).json()
    target = create(client, eid, "finding", "Original")
    manual = link(client, eid, source, target)
    content = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "mention", "attrs": {"recordId": target["id"], "label": "Original"}}, {"type": "text", "text": " and "}, {"type": "wikiLink", "attrs": {"recordId": target["id"], "label": "Original"}}]}]}
    saved = client.patch(f"/api/v1/engagements/{eid}/pages/{source['id']}", json={"revision": 1, "content": content})
    assert saved.status_code == 200, saved.text
    backlinks = client.get(f"/api/v1/engagements/{eid}/records/{target['id']}/document-backlinks").json()
    assert {item["origin"] for item in backlinks} == {"mention", "wiki"}
    update(client, target, title="Renamed")
    assert client.get(f"/api/v1/engagements/{eid}/records/{target['id']}/document-backlinks").json()[0]["source"]["id"] == source["id"]
    client.patch(f"/api/v1/engagements/{eid}/pages/{source['id']}", json={"revision": 2, "content": DOC})
    assert client.get(f"/api/v1/engagements/{eid}/records/{target['id']}/document-backlinks").json() == []
    assert relations(client, eid, source)[0]["id"] == manual["id"]


def test_P3_T06_new_blocks_roundtrip_and_invalid_target_rejected(client: TestClient) -> None:
    eid = engagement(client)
    page = client.post(f"/api/v1/engagements/{eid}/pages", json={"title": "Blocks"}).json()
    document = {"type": "doc", "content": [{"type": "callout", "attrs": {"tone": "info", "icon": "!"}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Callout"}]}]}, {"type": "fileAttachment", "attrs": {"evidenceId": "00000000-0000-0000-0000-000000000001", "label": "file"}}, {"type": "databaseView", "attrs": {"viewId": "00000000-0000-0000-0000-000000000002"}}]}
    response = client.patch(f"/api/v1/engagements/{eid}/pages/{page['id']}", json={"revision": 1, "content": document})
    assert response.status_code == 200 and response.json()["content"] == document
    bad = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "mention", "attrs": {"recordId": "not-a-uuid", "label": "bad"}}]}]}
    assert client.patch(f"/api/v1/engagements/{eid}/pages/{page['id']}", json={"revision": 2, "content": bad}).status_code == 422


def test_single_engagement_note_cannot_be_converted(client: TestClient) -> None:
    eid = engagement(client)
    scratch = client.get(f"/api/v1/engagements/{eid}/scratchpad").json()
    scratch = client.patch(f"/api/v1/engagements/{eid}/pages/{scratch['id']}", json={"revision": scratch["revision"], "content": DOC}).json()
    converted = client.post(f"/api/v1/engagements/{eid}/scratchpad/convert", json={"revision": scratch["revision"], "title": "Converted", "clear": False})
    assert converted.status_code == 404
    assert client.get(f"/api/v1/engagements/{eid}/scratchpad").json()["content"] == DOC


def upload(client: TestClient, eid: str, payload: bytes, filename: str = "proof.txt", **metadata: Any) -> Any:
    info = {"title": filename, "evidence_type": "Text document", "review_state": "Reviewed", **metadata}
    return client.post(f"/api/v1/engagements/{eid}/evidence-files?metadata={json.dumps(info)}", content=payload, headers={"Content-Type": "text/plain", "X-Filename": filename})


def test_P3_E01_E03_E04_E07_E09_evidence_storage_hash_download_and_links(client: TestClient, tmp_path: Path, monkeypatch: Any) -> None:
    monkeypatch.setenv("VAPT_EVIDENCE_DIR", str(tmp_path / "evidence"))
    eid = engagement(client)
    finding = create(client, eid, "finding")
    payload = b"GET / HTTP/1.1\r\nHost: example.test\r\n\r\n"
    response = upload(client, eid, payload, "../../escape.txt", evidence_type="HTTP exchange", related_id=finding["id"])
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["file"]["sha256"] == hashlib.sha256(payload).hexdigest()
    assert body["file"]["original_filename"] == "escape.txt"
    assert list((tmp_path / "evidence").iterdir())[0].parent == tmp_path / "evidence"
    evidence = body["page"]
    assert relations(client, eid, finding)[0]["source"]["id"] == evidence["id"]
    download = client.get(f"/api/v1/engagements/{eid}/evidence-files/{evidence['id']}/download")
    assert download.content == payload and "attachment" in download.headers["content-disposition"]
    preview = client.get(f"/api/v1/engagements/{eid}/evidence-files/{evidence['id']}/preview")
    assert preview.status_code == 200
    assert preview.text == payload.decode().replace("\r\n", "\n")


def test_P3_E05_E06_E08_E10_evidence_limits_safe_preview_and_isolation(client: TestClient, tmp_path: Path, monkeypatch: Any) -> None:
    monkeypatch.setenv("VAPT_EVIDENCE_DIR", str(tmp_path / "evidence"))
    one, two = engagement(client, "One"), engagement(client, "Two")
    response = upload(client, one, b"<script>alert(1)</script>", "active.html", review_state="Restricted")
    evidence = response.json()["page"]
    assert client.get(f"/api/v1/engagements/{one}/evidence-files/{evidence['id']}/preview").status_code == 403
    assert client.get(f"/api/v1/engagements/{two}/evidence-files/{evidence['id']}/download").status_code == 404
    oversized = upload(client, one, b"x" * (25 * 1024 * 1024 + 1), "huge.txt")
    assert oversized.status_code == 413


def test_P3_S01_S04_search_updates_deletes_and_isolates(client: TestClient) -> None:
    one, two = engagement(client, "One"), engagement(client, "Two")
    legacy = client.post(f"/api/v1/engagements/{one}/pages", json={"title": "Hidden Needle", "page_type": "note", "content": DOC}).json()
    assert client.get(f"/api/v1/engagements/{one}/search?q=Styled").json() == []
    finding = create(client, one, "finding", "Needle")
    assert client.get(f"/api/v1/engagements/{one}/search?q=Needle").json()[0]["id"] == finding["id"]
    finding = update(client, finding, title="changedphrase")
    assert client.get(f"/api/v1/engagements/{one}/search?q=changedphrase").json()[0]["id"] == finding["id"]
    assert client.get(f"/api/v1/engagements/{two}/search?q=changedphrase").json() == []
    client.delete(f"/api/v1/engagements/{one}/findings/{finding['id']}")
    assert client.get(f"/api/v1/engagements/{one}/search?q=changedphrase").json() == []
    assert client.get(f"/api/v1/engagements/{one}/pages/{legacy['id']}").status_code == 200


def preview(client: TestClient, eid: str, format: str, payload: bytes, filename: str = "input.txt") -> Any:
    return client.post(f"/api/v1/engagements/{eid}/imports/preview?format={format}&filename={filename}", content=payload, headers={"Content-Type": "application/octet-stream"})


def test_P3_I01_I04_supported_import_previews_do_not_mutate(client: TestClient) -> None:
    eid = engagement(client)
    fixtures = [
        ("csv", b"url,method\nhttps://example.test/a,GET\n"),
        ("json", b'[{"url":"https://example.test/b","method":"POST"}]'),
        ("katana-jsonl", b'{"url":"https://example.test/c","method":"GET"}\n'),
        ("feroxbuster-json", b'{"url":"https://example.test/d","method":"GET","status":200}\n'),
    ]
    for format, payload in fixtures:
        response = preview(client, eid, format, payload)
        assert response.status_code == 201 and len(response.json()["preview"]["records"]) == 1
    assert client.get(f"/api/v1/engagements/{eid}/attack-surfaces").json()["total"] == 0


def test_P3_I05_I10_import_confirm_idempotence_notes_and_history(client: TestClient) -> None:
    eid = engagement(client)
    assert preview(client, eid, "json", b"not json").status_code == 422
    job = preview(client, eid, "csv", b"url,method,source\nhttps://example.test/login,GET,katana\n", "scan.csv").json()
    assert client.get(f"/api/v1/engagements/{eid}/attack-surfaces").json()["total"] == 0
    first = client.post(f"/api/v1/engagements/{eid}/imports/confirm", json={"import_id": job["id"]})
    second = client.post(f"/api/v1/engagements/{eid}/imports/confirm", json={"import_id": job["id"]})
    assert first.json()["created"] == 1 and second.json()["created"] == 0
    surface = client.get(f"/api/v1/engagements/{eid}/attack-surfaces").json()["items"][0]
    surface = update(client, surface, content=DOC)
    next_job = preview(client, eid, "csv", b"url,method,source\nhttps://example.test/login,GET,feroxbuster\n", "again.csv").json()
    client.post(f"/api/v1/engagements/{eid}/imports/confirm", json={"import_id": next_job["id"]})
    assert client.get(f"/api/v1/engagements/{eid}/attack-surfaces/{surface['id']}").json()["content"] == DOC
    observations = client.get(f"/api/v1/engagements/{eid}/observations?surface_id={surface['id']}").json()
    assert observations["total"] == 2
    assert len(client.get(f"/api/v1/engagements/{eid}/imports").json()) == 2


def test_P3_templates_and_quick_capture_are_scoped(client: TestClient) -> None:
    one, two = engagement(client, "One"), engagement(client, "Two")
    initialized = client.post(f"/api/v1/engagements/{one}/content-templates/initialize")
    assert initialized.status_code == 201 and len(initialized.json()) == 5
    templates = client.get(f"/api/v1/engagements/{one}/content-templates").json()
    assert len(templates) == 5 and client.get(f"/api/v1/engagements/{two}/content-templates").json() == []
    created = client.post(f"/api/v1/engagements/{one}/content-templates/{templates[0]['id']}/instantiate", json={"title": "From template"})
    assert created.status_code == 201 and created.json()["content"]["content"][0]["type"] == "heading"
    capture = client.post(f"/api/v1/engagements/{one}/quick-capture", json={"kind": "finding", "title": "Captured candidate"})
    assert capture.status_code == 201 and capture.json()["record"]["validation_status"] == "Candidate"
    assert client.post(f"/api/v1/engagements/{one}/quick-capture", json={"kind": "note", "title": "Extra note"}).status_code == 422
