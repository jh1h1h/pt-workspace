"""Portable local development commands. Run from any directory."""

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
PYTHON = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
NPM = shutil.which("npm") or ("npm.cmd" if os.name == "nt" else "npm")


def execute(
    args: list[str], cwd: Path = ROOT, env: dict[str, str] | None = None
) -> None:
    subprocess.run(args, cwd=cwd, env=env, check=True)


def migrate(env: dict[str, str] | None = None) -> None:
    execute([str(PYTHON), "-m", "alembic", "upgrade", "head"], BACKEND, env)


def development() -> None:
    migrate()
    processes = [
        subprocess.Popen(
            [
                str(PYTHON),
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                "8000",
            ],
            cwd=BACKEND,
        ),
        subprocess.Popen(
            [NPM, "run", "dev", "--", "--port", "5173", "--strictPort"], cwd=FRONTEND
        ),
    ]
    print(
        "VAPT Workspace: http://127.0.0.1:5173 — Ctrl+C stops both servers.", flush=True
    )
    try:
        while all(p.poll() is None for p in processes):
            time.sleep(0.3)
    except KeyboardInterrupt:
        pass
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command",
        choices=[
            "install",
            "migrate",
            "dev",
            "backend-tests",
            "frontend-tests",
            "e2e",
            "checks",
            "seed",
        ],
    )
    command = parser.parse_args().command
    if command == "install":
        if not PYTHON.exists():
            execute([sys.executable, "-m", "venv", str(ROOT / ".venv")])
        execute(
            [
                str(PYTHON),
                "-m",
                "pip",
                "install",
                "-r",
                str(BACKEND / "requirements.lock.txt"),
            ]
        )
        execute([NPM, "ci"], FRONTEND)
        execute([NPM, "exec", "--", "playwright", "install", "chromium"], FRONTEND)
    elif command == "migrate":
        migrate()
    elif command == "dev":
        development()
    elif command == "seed":
        migrate()
        execute([str(PYTHON), str(ROOT / "scripts/seed.py")], BACKEND)
    else:
        if command in ["backend-tests", "checks"]:
            execute([str(PYTHON), "-m", "pytest", "-q"], BACKEND)
        if command in ["frontend-tests", "checks"]:
            execute([NPM, "test"], FRONTEND)
        if command == "checks":
            execute([NPM, "run", "typecheck"], FRONTEND)
            execute([NPM, "run", "lint"], FRONTEND)
            execute(
                [
                    str(PYTHON),
                    "-m",
                    "ruff",
                    "check",
                    str(BACKEND),
                    str(ROOT / "scripts"),
                ]
            )
            execute([NPM, "run", "build"], FRONTEND)
        if command in ["e2e", "checks"]:
            execute([NPM, "run", "e2e"], FRONTEND)


if __name__ == "__main__":
    main()
