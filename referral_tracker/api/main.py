"""ASGI entry point:  uvicorn referral_tracker.api.main:app"""
import logging
import os

from .app import create_app

logging.basicConfig(filename=os.environ.get("REFERRAL_LOG", "referral_tracker.log"),
                    level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
app = create_app()
