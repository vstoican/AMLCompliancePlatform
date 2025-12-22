import os
from pydantic import BaseModel


def _get_jwt_secret() -> str:
    """Get JWT secret from env or generate one (only for development)."""
    secret = os.getenv("JWT_SECRET_KEY")
    if secret:
        return secret
    # Fallback for development only - import secrets lazily
    import secrets
    return secrets.token_hex(32)


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
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "dev-secret-key-change-in-production")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    refresh_token_expire_days: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

    # Security
    password_min_length: int = 8
    max_failed_attempts: int = 5
    lockout_minutes: int = 15

    # External Services - Sanctions Screening
    sanctions_api_url: str = os.getenv("SANCTIONS_API_URL", "http://localhost:8081")
    sanctions_api_timeout: int = int(os.getenv("SANCTIONS_API_TIMEOUT", "30"))

    # S3/MinIO Storage
    s3_endpoint: str = os.getenv("S3_ENDPOINT", "http://localhost:9000")
    s3_access_key: str = os.getenv("S3_ACCESS_KEY", "minioadmin")
    s3_secret_key: str = os.getenv("S3_SECRET_KEY", "minioadmin")
    s3_bucket: str = os.getenv("S3_BUCKET", "aml-attachments")
    s3_archive_bucket: str = os.getenv("S3_ARCHIVE_BUCKET", "compliance-archives")
    s3_region: str = os.getenv("S3_REGION", "us-east-1")


settings = Settings()
