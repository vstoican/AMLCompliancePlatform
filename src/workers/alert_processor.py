"""
NATS JetStream Consumer for Alert Processing
Consumes aml.alert.created events and starts Temporal workflows
for orchestration of alert lifecycle.
"""
import asyncio
import json
import logging
import os
import signal
from datetime import timedelta
from typing import Optional
from uuid import uuid4

import nats
from nats.js.api import ConsumerConfig, AckPolicy, DeliverPolicy
from temporalio.client import Client as TemporalClient

# Configuration
NATS_URL = os.getenv("NATS_URL", "nats://localhost:4222")
TEMPORAL_HOST = os.getenv("TEMPORAL_HOST", "localhost")
TEMPORAL_PORT = os.getenv("TEMPORAL_PORT", "7233")

STREAM_NAME = "AML_EVENTS"
CONSUMER_NAME = "alert-processor"
SUBJECT = "aml.alert.created"

# System user for automated actions
SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"

# Global state
running = True
temporal_client: Optional[TemporalClient] = None

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


async def start_alert_workflow(alert_data: dict) -> dict:
    """Start an AlertLifecycleWorkflow for a new alert"""
    global temporal_client

    if not temporal_client:
        logger.error("Temporal client not connected")
        return {"success": False, "error": "Temporal client not connected"}

    alert_id = alert_data.get("alert_id")
    if not alert_id:
        logger.error("No alert_id in event payload")
        return {"success": False, "error": "Missing alert_id"}

    try:
        # Import workflow class and constants
        from src.workflows.worker import AlertLifecycleWorkflow, INTERNAL_TASK_QUEUE, INTERNAL_NAMESPACE

        # Build params from alert data
        params = {
            "customer_id": str(alert_data.get("customer_id", "")),
            "scenario": alert_data.get("scenario", "unknown"),
            "severity": alert_data.get("severity", "medium"),
            "type": alert_data.get("type", "transaction"),
            "status": alert_data.get("status", "open"),
        }

        # Start workflow with "init" action
        workflow_id = f"alert-{alert_id}-init-{uuid4().hex[:8]}"

        handle = await temporal_client.start_workflow(
            AlertLifecycleWorkflow.run,
            args=[
                alert_id,
                "init",
                SYSTEM_USER_ID,
                "system",
                params,
            ],
            id=workflow_id,
            task_queue=INTERNAL_TASK_QUEUE,
        )

        logger.info(
            f"Started AlertLifecycleWorkflow for alert {alert_id}: "
            f"workflow_id={workflow_id}, scenario={params['scenario']}, severity={params['severity']}"
        )

        return {
            "success": True,
            "alert_id": alert_id,
            "workflow_id": workflow_id,
            "run_id": handle.result_run_id,
        }

    except Exception as e:
        logger.error(f"Error starting workflow for alert {alert_id}: {e}")
        return {"success": False, "error": str(e)}


async def process_messages(js, sub):
    """Process messages from JetStream subscription"""
    global running

    total_processed = 0
    total_errors = 0
    start_time = asyncio.get_event_loop().time()

    logger.info("Starting message processing loop...")

    while running:
        try:
            # Fetch messages one at a time for reliable processing
            try:
                msgs = await sub.fetch(batch=10, timeout=1.0)
                for msg in msgs:
                    try:
                        alert_data = json.loads(msg.data.decode())
                        alert_id = alert_data.get("alert_id", "unknown")

                        logger.info(f"Processing alert creation event: alert_id={alert_id}")

                        result = await start_alert_workflow(alert_data)

                        if result.get("success"):
                            total_processed += 1
                            await msg.ack()
                        else:
                            total_errors += 1
                            # NAK for retry on failure
                            await msg.nak(delay=5)  # Retry after 5 seconds
                            logger.warning(f"Failed to process alert {alert_id}: {result.get('error')}")

                    except json.JSONDecodeError as e:
                        logger.error(f"Invalid JSON in message: {e}")
                        await msg.ack()  # Ack bad messages to avoid infinite redelivery
                        total_errors += 1

            except nats.errors.TimeoutError:
                pass  # No messages available

            # Log stats periodically
            if total_processed > 0 and total_processed % 100 == 0:
                elapsed = asyncio.get_event_loop().time() - start_time
                rate = total_processed / elapsed if elapsed > 0 else 0
                logger.info(
                    f"Stats: processed={total_processed}, errors={total_errors}, rate={rate:.2f}/s"
                )

        except Exception as e:
            logger.error(f"Error in message processing loop: {e}")
            await asyncio.sleep(1)  # Back off on error

    logger.info(f"Message processing complete. Total: {total_processed} processed, {total_errors} errors")


async def run_processor():
    """Main processor loop"""
    global running, temporal_client

    logger.info("=" * 60)
    logger.info("Alert Processor - NATS JetStream → Temporal Workflows")
    logger.info("=" * 60)
    logger.info(f"NATS URL: {NATS_URL}")
    logger.info(f"Temporal: {TEMPORAL_HOST}:{TEMPORAL_PORT}")
    logger.info(f"Stream: {STREAM_NAME}")
    logger.info(f"Subject: {SUBJECT}")
    logger.info("")

    # Connect to Temporal (internal namespace for lifecycle workflows)
    logger.info("Connecting to Temporal (internal namespace)...")
    try:
        from src.workflows.worker import INTERNAL_NAMESPACE
        temporal_client = await TemporalClient.connect(
            f"{TEMPORAL_HOST}:{TEMPORAL_PORT}",
            namespace=INTERNAL_NAMESPACE,
        )
        logger.info(f"Temporal connected to namespace '{INTERNAL_NAMESPACE}'")
    except Exception as e:
        logger.error(f"Failed to connect to Temporal: {e}")
        return

    # Connect to NATS
    logger.info("Connecting to NATS...")
    nc = await nats.connect(NATS_URL)
    js = nc.jetstream()
    logger.info("NATS connected")

    # Ensure stream exists
    try:
        await js.stream_info(STREAM_NAME)
        logger.info(f"Stream '{STREAM_NAME}' found")
    except nats.js.errors.NotFoundError:
        logger.info(f"Creating stream '{STREAM_NAME}'...")
        await js.add_stream(
            name=STREAM_NAME,
            subjects=["aml.>"],
            retention="limits",
            max_age=30 * 24 * 60 * 60,  # 30 days
            max_bytes=2 * 1024**3,  # 2GB
            storage="file",
        )

    # Create durable consumer
    logger.info(f"Creating consumer '{CONSUMER_NAME}'...")
    try:
        sub = await js.pull_subscribe(
            SUBJECT,
            durable=CONSUMER_NAME,
            config=ConsumerConfig(
                ack_policy=AckPolicy.EXPLICIT,
                deliver_policy=DeliverPolicy.NEW,  # Only process new messages
                max_ack_pending=1000,
                ack_wait=60,  # 60 seconds to process before redelivery
            ),
        )
        logger.info(f"Subscribed to '{SUBJECT}'")
    except Exception as e:
        logger.error(f"Error creating consumer: {e}")
        raise

    # Handle shutdown signals
    def signal_handler():
        global running
        logger.info("Shutdown signal received...")
        running = False

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, signal_handler)

    # Process messages
    logger.info("Ready - waiting for alert creation events...")
    await process_messages(js, sub)

    # Cleanup
    logger.info("Cleaning up...")
    await nc.drain()
    if temporal_client:
        await temporal_client.close()
    logger.info("Shutdown complete")


if __name__ == "__main__":
    asyncio.run(run_processor())
