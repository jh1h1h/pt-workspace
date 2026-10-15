"""Run the actual API against an isolated temporary migrated SQLite database."""

import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import uvicorn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
with TemporaryDirectory(prefix="vapt-e2e-") as temp:
    os.environ["VAPT_DATABASE_URL"] = f"sqlite:///{Path(temp) / 'acceptance.db'}"
    os.environ["VAPT_EVIDENCE_DIR"] = str(Path(temp) / "evidence")
    subprocess.run(
        [
            sys.executable,
            "-m",
            "alembic",
            "-c",
            str(ROOT / "backend/alembic.ini"),
            "upgrade",
            "head",
        ],
        cwd=ROOT,
        check=True,
    )
    uvicorn.run("app.main:app", host="127.0.0.1", port=int(os.getenv("VAPT_E2E_API_PORT", "8000")))
