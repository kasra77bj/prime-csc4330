"""Role-based access control: single source of truth for docs/13 section 3.

Every router uses `Depends(require(Permission.X))`. Never check roles ad hoc.
"""
from __future__ import annotations

import enum
import uuid

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.core.security import decode_token
from app.db import get_db
from app.models import User, UserRole


class Permission(str, enum.Enum):
    view_live = "view_live"                          # dashboard, live values, camera, aggregated trends
    control_session = "control_session"              # start / pause / resume / stop
    acknowledge_alert = "acknowledge_alert"
    flag_frame = "flag_frame"
    escalate = "escalate"
    view_raw_data = "view_raw_data"
    decide_recommendation = "decide_recommendation"  # accept / modify / reject AI
    manual_adjust = "manual_adjust"
    resolve_alert = "resolve_alert"
    manage_sessions = "manage_sessions"              # create sessions, edit jobs/limits, sensor test
    view_reports = "view_reports"                    # sessions history, reports
    export_data = "export_data"
    manage_users = "manage_users"
    demo_controls = "demo_controls"
    view_audit = "view_audit"


P = Permission
ROLE_PERMISSIONS: dict[UserRole, frozenset[Permission]] = {
    UserRole.operator: frozenset({P.view_live, P.control_session, P.acknowledge_alert, P.flag_frame, P.escalate}),
    UserRole.engineer: frozenset({P.view_live, P.control_session, P.acknowledge_alert, P.flag_frame,
                                  P.view_raw_data, P.decide_recommendation, P.manual_adjust, P.resolve_alert,
                                  P.manage_sessions, P.view_reports, P.export_data}),
    UserRole.admin: frozenset({P.view_live, P.view_raw_data, P.manage_sessions, P.view_reports,
                               P.manage_users, P.demo_controls, P.view_audit}),
    UserRole.manager: frozenset({P.view_live, P.view_reports, P.export_data}),
}
# Team lead (the project team's own accounts): engineer + admin rights, e.g. start prints and run the demo panel.
ROLE_PERMISSIONS[UserRole.lead] = ROLE_PERMISSIONS[UserRole.engineer] | ROLE_PERMISSIONS[UserRole.admin]


def has_permission(role: UserRole, perm: Permission) -> bool:
    return perm in ROLE_PERMISSIONS[role]


def permissions_for(role: UserRole) -> list[str]:
    return sorted(p.value for p in ROLE_PERMISSIONS[role])


_bearer = HTTPBearer(auto_error=False)


async def current_user(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
                       db: AsyncSession = Depends(get_db)) -> User:
    if creds is None:
        raise APIError(401, "UNAUTHENTICATED", "Sign in required")
    try:
        payload = decode_token(creds.credentials, "access")
    except jwt.ExpiredSignatureError:
        raise APIError(401, "TOKEN_EXPIRED", "Session expired, refresh the token")
    except jwt.PyJWTError:
        raise APIError(401, "UNAUTHENTICATED", "Invalid token")
    user = await db.get(User, uuid.UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise APIError(401, "UNAUTHENTICATED", "User not active")
    request.state.user = user
    return user


def require(perm: Permission):
    async def dep(user: User = Depends(current_user)) -> User:
        if not has_permission(user.role, perm):
            raise APIError(403, "FORBIDDEN_ROLE", "Your role does not allow this action",
                           {"required": perm.value, "role": user.role.value,
                            "hint": "Engineer approval required" if perm in (
                                P.decide_recommendation, P.manual_adjust, P.view_raw_data) else None})
        return user
    return dep
