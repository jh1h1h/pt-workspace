import os
from alembic import context
from sqlalchemy import create_engine, pool
from app.core.database import Base
from app.models import records  # noqa: F401
from app.models import entities  # noqa: F401

config = context.config
url = os.getenv("VAPT_DATABASE_URL", config.get_main_option("sqlalchemy.url"))


def include_object(object: object, name: str | None, type_: str, reflected: bool, compare_to: object) -> bool:
    # FTS5 owns this virtual table and its shadow tables; SQLAlchemy metadata does not.
    return not (type_ == "table" and name is not None and name.startswith("page_search"))


if context.is_offline_mode():
    context.configure(url=url, target_metadata=Base.metadata, literal_binds=True, include_object=include_object)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = create_engine(url, poolclass=pool.NullPool)
    with engine.connect() as connection:
        # SQLite batch migrations rebuild referenced tables. Temporarily suspend FK
        # enforcement on this migration connection only and verify before commit.
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.commit()
        context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=True, include_object=include_object)
        with context.begin_transaction():
            context.run_migrations()
            violations = connection.exec_driver_sql("PRAGMA foreign_key_check").all()
            if violations:
                raise RuntimeError(f"Migration foreign-key check failed: {violations}")
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
