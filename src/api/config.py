import os
import secrets
from pydantic import BaseModel


class Settings(BaseModel):
    # Database
    database_host: str = os.getenv("DATABASE_HOST", "localhost")
    database_port: int = int(os.getenv("DATABASE_PORT", "5432"))
    database_name: str = os.getenv("DATABASE_NAME", "aml")
    database_user: str = os.getenv("DATABASE_USER", "aml_user")
    database_password: str = os.getenv("DATABASE_PASSWORD", "aml_pass")

    # NATS
    nats_url: str = os.getenv("NATS_URL", "nats://localhost:4222")

    # Temporal
    temporal_host: str = os.getenv("TEMPORAL_HOST", "localhost")
    temporal_port: int = int(os.getenv("TEMPORAL_PORT", "7233"))

    # JWT Authentication
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", secrets.token_hex(32))
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    refresh_token_expire_days: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

    # Security
    password_min_length: int = 8
    max_failed_attempts: int = 5
    lockout_minutes: int = 15


settings = Settings()
