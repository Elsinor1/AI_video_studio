"""
Database reset utility
Run this script to reset the database schema (WARNING: This will delete all data!)
"""
from sqlalchemy import inspect
from .database import engine, Base
from . import models  # Register all models with Base.metadata
import os

def reset_database():
    """Drop all tables and recreate them"""
    print("Dropping all tables...")
    Base.metadata.drop_all(bind=engine)
    
    print("Creating all tables...")
    Base.metadata.create_all(bind=engine)
    
    print("Database reset complete!")

def check_schema():
    """Check if database schema matches models"""
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    
    # Check if scenes table exists and has project_id column
    if 'scenes' in tables:
        columns = [col['name'] for col in inspector.get_columns('scenes')]
        if 'project_id' not in columns:
            print("ERROR: scenes table is missing 'project_id' column")
            print(f"Current columns: {columns}")
            return False
        else:
            print("Schema check passed!")
            return True
    else:
        print("scenes table doesn't exist - will be created")
        return True

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--force":
        print("Force resetting database...")
        reset_database()
    else:
        print("Checking database schema...")
        if not check_schema():
            print("\nSchema mismatch detected!")
            print("To reset the database, run: python -m backend.reset_db --force")
            print("WARNING: This will delete all data!")
        else:
            print("Schema is correct.")
