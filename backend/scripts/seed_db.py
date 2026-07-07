"""
Standalone script to seed the database
Run with: python -m scripts.seed_db
"""
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.core.seed import seed_database
import asyncio

if __name__ == "__main__":
    asyncio.run(seed_database())
