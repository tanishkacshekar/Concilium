"""
FastAPI dependencies for authentication and authorization
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from typing import List, Optional
from app.core.database import get_database
from app.core.security import decode_access_token
from app.models.user import User
from bson import ObjectId

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

async def get_user_from_token(token: Optional[str]) -> Optional[User]:
    """Get user from JWT token string. Returns None if invalid."""
    if not token or not token.strip():
        return None
    payload = decode_access_token(token.strip())
    if not payload:
        return None
    email: str = payload.get("sub")
    if not email:
        return None
    db = await get_database()
    user = await db.users.find_one({"email": email})
    if not user:
        return None
    return User(
        id=str(user["_id"]),
        **{k: v for k, v in user.items() if k != "_id" and k != "hashed_password"}
    )


async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """Get current authenticated user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token is None:
        raise credentials_exception
    user = await get_user_from_token(token)
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get current active user (placeholder for future account status checks)"""
    # Future: Add account status checks (active, suspended, etc.)
    return current_user

def require_role(allowed_roles: List[str]):
    """Dependency factory for role-based access control"""
    async def role_checker(current_user: User = Depends(get_current_active_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {', '.join(allowed_roles)}"
            )
        return current_user
    return role_checker

# Convenience dependencies for common role checks
require_manager = require_role(["manager"])
require_manager_or_member = require_role(["manager", "member"])

async def verify_project_membership(
    project_id: str,
    current_user: User = Depends(get_current_user)
) -> dict:
    """Verify user is a member of the project and return project."""
    db = await get_database()

    if not isinstance(project_id, str) or not ObjectId.is_valid(project_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID",
        )

    project = await db["projects"].find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    
    if current_user.id not in project.get("members", []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to project"
        )
    
    return project

async def verify_project_owner(
    project_id: str,
    current_user: User = Depends(get_current_user)
) -> dict:
    """Verify user is the owner of the project"""
    project = await verify_project_membership(project_id, current_user)
    
    if project.get("owner_id") != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only project owner can perform this action"
        )
    
    return project
