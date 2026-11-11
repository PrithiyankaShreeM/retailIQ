import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timedelta
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from .database import get_db
from .models import User

SECRET_KEY = os.getenv("SECRET_KEY", "retailiq-local-development-key-change-in-production")
ALGORITHM = "HS256"
bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger("uvicorn.error")


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    iterations = 240000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), iterations).hex()
    return f"pbkdf2_sha256${iterations}${salt}${digest}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt, expected = encoded.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations)).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_token(user: User) -> str:
    now = datetime.utcnow()
    payload = {
        "sub": user.id,
        "store_id": user.store_id,
        "iat": now,
        "exp": now + timedelta(days=7),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Your session has expired. Please sign in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    # Preview proxies and browser extensions may replace Authorization or block
    # third-party cookies. Accept the fresh runtime header, cookie, and bearer
    # token independently instead of letting one stale credential veto the rest.
    candidates = [
        ("runtime", request.headers.get("x-retailiq-token")),
        ("bearer", credentials.credentials if credentials else None),
        ("cookie", request.cookies.get("retailiq_session")),
    ]
    present = []
    for source, token in candidates:
        if not token:
            continue
        present.append(source)
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
        except jwt.PyJWTError:
            continue
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            return user
    if present:
        logger.warning("RetailIQ authentication failed; credential sources: %s", present)
    raise unauthorized
