"""
S3-compatible storage client for file attachments.
Uses MinIO in development, can be configured for AWS S3 in production.
"""
import os
from typing import Optional
from io import BytesIO

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


# S3 Configuration from environment
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://localhost:9000")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "minioadmin")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "minioadmin")
S3_BUCKET = os.getenv("S3_BUCKET", "aml-attachments")
S3_REGION = os.getenv("S3_REGION", "us-east-1")

# Singleton client
_s3_client = None


def get_s3_client():
    """Get or create S3 client singleton."""
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=S3_ENDPOINT,
            aws_access_key_id=S3_ACCESS_KEY,
            aws_secret_access_key=S3_SECRET_KEY,
            region_name=S3_REGION,
            config=Config(signature_version="s3v4"),
        )
    return _s3_client


def ensure_bucket_exists():
    """Ensure the S3 bucket exists, create if not."""
    client = get_s3_client()
    try:
        client.head_bucket(Bucket=S3_BUCKET)
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code == "404" or error_code == "NoSuchBucket":
            client.create_bucket(Bucket=S3_BUCKET)
        else:
            raise


def upload_file(
    content: bytes,
    key: str,
    content_type: str = "application/octet-stream",
    metadata: Optional[dict] = None,
) -> str:
    """
    Upload a file to S3.

    Args:
        content: File content as bytes
        key: S3 object key (path within bucket)
        content_type: MIME type of the file
        metadata: Optional metadata dict

    Returns:
        The S3 key where the file was stored
    """
    client = get_s3_client()

    extra_args = {"ContentType": content_type}
    if metadata:
        extra_args["Metadata"] = metadata

    client.upload_fileobj(
        BytesIO(content),
        S3_BUCKET,
        key,
        ExtraArgs=extra_args,
    )

    return key


def download_file(key: str) -> tuple[bytes, str, Optional[str]]:
    """
    Download a file from S3.

    Args:
        key: S3 object key

    Returns:
        Tuple of (content bytes, content_type, original_filename from metadata)
    """
    client = get_s3_client()

    response = client.get_object(Bucket=S3_BUCKET, Key=key)
    content = response["Body"].read()
    content_type = response.get("ContentType", "application/octet-stream")
    metadata = response.get("Metadata", {})
    original_filename = metadata.get("original_filename")

    return content, content_type, original_filename


def delete_file(key: str) -> bool:
    """
    Delete a file from S3.

    Args:
        key: S3 object key

    Returns:
        True if deletion was successful
    """
    client = get_s3_client()

    try:
        client.delete_object(Bucket=S3_BUCKET, Key=key)
        return True
    except ClientError:
        return False


def file_exists(key: str) -> bool:
    """
    Check if a file exists in S3.

    Args:
        key: S3 object key

    Returns:
        True if file exists
    """
    client = get_s3_client()

    try:
        client.head_object(Bucket=S3_BUCKET, Key=key)
        return True
    except ClientError:
        return False


def generate_presigned_url(key: str, expires_in: int = 3600) -> str:
    """
    Generate a presigned URL for temporary direct access to a file.

    Args:
        key: S3 object key
        expires_in: URL expiration time in seconds (default 1 hour)

    Returns:
        Presigned URL string
    """
    client = get_s3_client()

    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": key},
        ExpiresIn=expires_in,
    )

    return url
