from fastapi import Depends

from .errors import ForbiddenError
from .middleware.auth import AuthUser, get_current_user


def require_role(*allowed_roles: str):
    """FastAPI dependency factory that enforces role membership."""

    async def _check(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if user.role not in allowed_roles:
            raise ForbiddenError(
                f"Role '{user.role or 'none'}' not permitted; "
                f"requires one of: {', '.join(allowed_roles)}"
            )
        return user

    return _check
