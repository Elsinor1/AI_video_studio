"""
Alembic env - uses backend.database and backend.models.
Run from project root: alembic upgrade head
After changing models: alembic revision --autogenerate -m "add xyz" then alembic upgrade head
"""
import sys
from pathlib import Path

# Add project root so "backend" can be imported
project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from logging.config import fileConfig
from alembic import context
from dotenv import load_dotenv

load_dotenv(project_root / ".env")

# Import so all models are registered on Base.metadata; use app's engine
from backend.database import Base, engine, DATABASE_URL
from backend import models  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", DATABASE_URL)
target_metadata = Base.metadata


def run_migrations_offline():
    """Run migrations in 'offline' mode (no DB connection, only generate SQL)."""
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    """Run migrations in 'online' mode (connect to DB)."""
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
