"""Preview or explicitly import a local Test Case checklist through the loopback API."""

import argparse
import json
from pathlib import Path
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from uuid import UUID


SECTIONS = ("prerequisites", "actions", "expected", "finding_condition", "evidence")
PRIORITY_PATTERN = re.compile(r"P([1-9][0-9]{0,4})")
LABELS = {
    "prerequisites": "Prerequisites",
    "actions": "Testing procedure",
    "expected": "Expected secure behavior",
    "finding_condition": "Finding threshold",
    "evidence": "Sanitized evidence to retain",
}


def load_cases(path: Path) -> list[dict]:
    cases = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(cases, list) or not cases:
        raise ValueError("Expected a nonempty JSON array of test cases")
    titles = set()
    for index, case in enumerate(cases, 1):
        if not isinstance(case, dict) or set(case) not in ({"title", "category", *SECTIONS}, {"title", "category", "priority", *SECTIONS}):
            raise ValueError(f"Case {index}: expected title, category, optional priority and all five procedure sections")
        if "priority" in case and (
            not isinstance(case["priority"], str) or PRIORITY_PATTERN.fullmatch(case["priority"]) is None
        ):
            raise ValueError(f"Case {index}: priority must be P1 through P99999")
        if any(not isinstance(case[key], str) or not case[key].strip() for key in ("title", "category")):
            raise ValueError(f"Case {index}: title and category must be nonempty strings")
        if len(case["title"]) > 300 or len(case["category"]) > 200:
            raise ValueError(f"Case {index}: title or category is too long")
        for section in SECTIONS:
            if not isinstance(case[section], list) or not case[section] or any(
                not isinstance(item, str) or not item.strip() for item in case[section]
            ):
                raise ValueError(f"Case {index}: {section} must be a nonempty list of strings")
        if case["title"] in titles:
            raise ValueError(f"Duplicate title in file: {case['title']}")
        titles.add(case["title"])
    if any("priority" in case for case in cases):
        if any("priority" not in case for case in cases):
            raise ValueError("All cases must have a priority when any case has one")
        cases.sort(key=lambda case: int(case["priority"][1:]))
    return cases


def document(case: dict) -> dict:
    nodes = []
    for section in SECTIONS:
        nodes.append({"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": LABELS[section]}]})
        for index, item in enumerate(case[section], 1):
            prefix = f"{index}. " if section == "actions" else ""
            nodes.append({"type": "paragraph", "content": [{"type": "text", "text": prefix + item}]})
    return {"type": "doc", "content": nodes}


def case_payload(case: dict) -> dict:
    return {
        "title": case["title"], "category": case["category"], "content": document(case),
        "priority": case.get("priority", "P2"),
        "execution_status": "Not Started", "assessment_outcome": "Not Assessed",
    }


def api_request(base: str, path: str, payload: dict | None = None) -> dict:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(base + path, data=body, headers={"Content-Type": "application/json"} if body else {})
    try:
        with urlopen(request, timeout=10) as response:
            return json.load(response)
    except HTTPError as error:
        raise RuntimeError(f"API returned {error.code} for {path}: {error.read().decode('utf-8')[:500]}") from error
    except URLError as error:
        raise RuntimeError(f"Cannot reach the local API: {error.reason}") from error


def existing_titles(base: str, eid: str) -> set[str]:
    titles = set()
    offset = 0
    while True:
        response = api_request(base, f"/api/v1/engagements/{eid}/test-cases?{urlencode({'limit': 200, 'offset': offset})}")
        titles.update(item["title"] for item in response["items"])
        offset += len(response["items"])
        if offset >= response["total"]:
            return titles
        if not response["items"]:
            raise RuntimeError("Test Case listing stopped before the reported total")


def resolve_engagement(base: str, identifier: str) -> dict:
    if not identifier.strip():
        raise ValueError("Engagement name cannot be empty")
    try:
        eid = str(UUID(identifier))
    except ValueError:
        eid = None
    if eid:
        return api_request(base, f"/api/v1/engagements/{eid}")

    matches = []
    offset = 0
    while True:
        response = api_request(base, f"/api/v1/engagements?{urlencode({'limit': 200, 'offset': offset})}")
        matches.extend(item for item in response["items"] if item["name"] == identifier)
        offset += len(response["items"])
        if offset >= response["total"]:
            break
        if not response["items"]:
            raise RuntimeError("Engagement listing stopped before the reported total")
    if not matches:
        raise ValueError(f"No active engagement named {identifier!r}")
    if len(matches) > 1:
        raise ValueError(f"Multiple active engagements named {identifier!r}; use a UUID: {', '.join(item['id'] for item in matches)}")
    return matches[0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path, help="Local JSON checklist")
    parser.add_argument("engagement", help="Destination engagement UUID or exact name")
    parser.add_argument("--api", default="http://127.0.0.1:8000", help="Loopback API base URL")
    parser.add_argument("--apply", action="store_true", help="Create missing cases (default: preview only)")
    parser.add_argument(
        "--purge", action="store_true",
        help="Replace ALL selected-engagement Test Cases, including trash and execution notes; preview unless --apply",
    )
    args = parser.parse_args()
    parsed = urlparse(args.api)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost"} or parsed.username or parsed.password or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        parser.error("--api must be a loopback HTTP origin, e.g. http://127.0.0.1:8000")
    try:
        cases = load_cases(args.file)
        base = args.api.rstrip("/")
        if args.purge or any("priority" in case for case in cases):
            schema = api_request(base, "/openapi.json")
            fields = schema.get("components", {}).get("schemas", {}).get("TestCreate", {}).get("properties", {})
            if "priority" not in fields:
                raise RuntimeError(
                    "The running API does not support Test Case priority. Stop the old dev server and "
                    "restart with 'python3 scripts/run.py dev' so its migration and updated code load; "
                    "then preview the import again."
                )
            if args.purge:
                paths = schema.get("paths", {})
                if (
                    "get" not in paths.get("/api/v1/engagements/{eid}/test-cases/purge-preview", {})
                    or "post" not in paths.get("/api/v1/engagements/{eid}/test-cases/replace", {})
                ):
                    raise RuntimeError(
                        "The running API does not support safe Test Case purge. Restart the backend with "
                        "'python3 scripts/run.py dev', then preview again. Nothing was purged."
                    )
        engagement = resolve_engagement(base, args.engagement)
        eid = engagement["id"]
        print(f"Destination: {engagement['name']} ({eid})")
        if args.purge:
            if len(cases) > 1000:
                raise ValueError("Atomic purge-and-import supports at most 1000 replacement cases")
            preview = api_request(base, f"/api/v1/engagements/{eid}/test-cases/purge-preview")
            print(f"PURGE: permanently remove {preview['count']} Test Cases, including trash and execution notes.")
            print("Other record types, attachments, engagements and display-ID counters are preserved.")
            for case in cases:
                print(f"{'REPLACE' if args.apply else 'PREVIEW REPLACE'} {case['title']}")
            if not args.apply:
                print(f"Preview only: {len(cases)} replacements. Nothing deleted or imported. Run with --purge --apply to replace.")
                return
            result = api_request(base, f"/api/v1/engagements/{eid}/test-cases/replace", {
                "confirmation": preview["confirmation"], "cases": [case_payload(case) for case in cases],
            })
            for created in result["created"]:
                print(f"Created {created['display_id']}: {created['title']}")
            print(f"Purged {result['purged']}; created {len(result['created'])} in one transaction. No findings created.")
            return
        titles = existing_titles(base, eid)
        pending = [case for case in cases if case["title"] not in titles]
        for case in cases:
            print(f"{'SKIP (title exists)' if case['title'] in titles else 'CREATE' if args.apply else 'PREVIEW'} {case['title']}")
        if not args.apply:
            print(f"Preview only: {len(pending)} to create, {len(cases) - len(pending)} already present. Run with --apply to import.")
            return
        for case in pending:
            created = api_request(base, f"/api/v1/engagements/{eid}/test-cases", case_payload(case))
            print(f"Created {created['display_id']}: {created['title']}")
        print(f"Created {len(pending)}; skipped {len(cases) - len(pending)}. No findings were created.")
    except (OSError, ValueError, RuntimeError, KeyError) as error:
        parser.exit(1, f"Import stopped: {error}\n")


if __name__ == "__main__":
    main()