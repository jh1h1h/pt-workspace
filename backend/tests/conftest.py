import asyncio
from collections.abc import Generator
from pathlib import Path
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from app.core.database import get_db
from app.main import app


@pytest.fixture
def database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> sessionmaker[Session]:
    url = f"sqlite:///{tmp_path / 'test.db'}"
    monkeypatch.setenv("VAPT_DATABASE_URL", url)
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    engine = create_engine(url, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def foreign_keys(connection: object, _: object) -> None:
        connection.execute("PRAGMA foreign_keys=ON")

    return sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
def client(database: sessionmaker[Session]) -> Generator[TestClient, None, None]:
    def override() -> Generator[Session, None, None]:
        with database() as session:
            yield session

    app.dependency_overrides[get_db] = override

    # A timer keeps the loop responsive in restricted runners where cross-thread
    # self-pipe wakeups are denied. This does not open a network listener.
    def loop_factory() -> asyncio.AbstractEventLoop:
        loop = asyncio.new_event_loop()

        def heartbeat() -> None:
            loop.call_later(0.01, heartbeat)

        loop.call_soon(heartbeat)
        return loop

    with TestClient(app, backend_options={"loop_factory": loop_factory}) as client:
        yield client
    app.dependency_overrides.clear()
