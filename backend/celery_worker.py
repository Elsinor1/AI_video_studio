"""
Celery worker entry point
Run with: celery -A backend.celery_worker worker --loglevel=info --concurrency=2
"""

from .tasks import celery_app

if __name__ == "__main__":
    celery_app.start()
