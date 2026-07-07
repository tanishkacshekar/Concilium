"""
List all users in the database (id, email, name, role).
Passwords are NOT stored in plain text — only password hashes exist. You cannot retrieve
original passwords from the database. Use the app's login/register or change-password
to set passwords; for development, run the seed script and use the credentials it prints.
"""
import asyncio
import os
import sys

# Allow running from backend/ or project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from datetime import datetime


async def list_users():
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DB_NAME]
    users = []
    async for u in db.users.find({}):
        users.append({
            "id": str(u["_id"]),
            "email": u.get("email", ""),
            "name": u.get("name", ""),
            "role": u.get("role", ""),
            "created_at": u.get("created_at"),
        })
    client.close()
    return users


def main():
    users = asyncio.run(list_users())
    if not users:
        print("No users in database. Run: python -m app.core.seed (from backend/) to seed test users.")
        return
    print(f"Users in {settings.MONGODB_DB_NAME} ({len(users)} total):\n")
    for u in users:
        created = u["created_at"].strftime("%Y-%m-%d %H:%M") if u.get("created_at") else "—"
        print(f"  id:    {u['id']}")
        print(f"  email:  {u['email']}")
        print(f"  name:  {u['name']}")
        print(f"  role:  {u['role']}")
        print(f"  created: {created}")
        print()
    print("Note: Passwords are stored as hashed values only; they cannot be retrieved.")


if __name__ == "__main__":
    main()
