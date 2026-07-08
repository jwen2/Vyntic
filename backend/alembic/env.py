"""Alembic environment. The app's ORM metadata is the autogenerate target;
the URL comes from (in order) -x url=..., alembic.ini, app settings."""
from alembic import context
from sqlalchemy import create_engine

from app.database import Base

target_metadata = Base.metadata


def _url() -> str:
    x_url = context.get_x_argument(as_dictionary=True).get("url")
    if x_url:
        return x_url
    ini_url = context.config.get_main_option("sqlalchemy.url")
    if ini_url:
        return ini_url
    from app.config import settings

    return settings.database_url


def run_migrations_offline() -> None:
    context.configure(
        url=_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_url())
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # SQLite can't ALTER in place; batch mode rebuilds the table.
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
