# Database migrations (Alembic)

Use this instead of `python -m backend.reset_db --force` when you only change the schema (new tables/columns). Your data is kept.

## First-time setup (new project, empty DB)

From project root:

```bash
alembic upgrade head
```

This creates all tables.

## You already have a DB (e.g. before Alembic existed)

1. Mark the current schema as “already applied” so only new migrations run:

   ```bash
   alembic stamp 001_initial
   ```

2. Apply new migrations (e.g. add `script_iterations`):

   ```bash
   alembic upgrade head
   ```

## After you change `backend/models.py`

1. Generate a new migration:

   ```bash
   alembic revision --autogenerate -m "add_my_new_table"
   ```

2. Review `alembic/versions/xxxx_add_my_new_table.py`, then apply:

   ```bash
   alembic upgrade head
   ```

## Reset DB (wipe everything, recreate from models)

Only when you really want to drop all data:

```bash
python -m backend.reset_db --force
```

Then either use the app (it runs `create_all` on startup) or run `alembic stamp head` so Alembic and the DB are in sync.
