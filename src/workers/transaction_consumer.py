"""
NATS JetStream Consumer for Transaction Processing
Consumes transactions from NATS and writes to TimescaleDB in batches
Uses COPY for maximum throughput
"""
import asyncio
import io
import json
import os
import signal
from datetime import datetime
from typing import Optional

import nats
from nats.js.api import ConsumerConfig, AckPolicy, DeliverPolicy
from psycopg import AsyncConnection
from psycopg.copy import AsyncCopy
from psycopg_pool import AsyncConnectionPool

# Configuration
NATS_URL = os.getenv("NATS_URL", "nats://localhost:4222")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://aml:aml@localhost:5432/amldb")

STREAM_NAME = "AML_EVENTS"
CONSUMER_NAME = "transaction-processor"
SUBJECT = "aml.transaction.ingest"

# Batch settings for high throughput
BATCH_SIZE = 2000  # Larger batches = more efficient COPY
BATCH_TIMEOUT = 0.2  # 200ms - allow batch to fill more before flush
MAX_PENDING = 100000  # Max messages to buffer

# Global state
running = True
pool: Optional[AsyncConnectionPool] = None


async def create_db_pool() -> AsyncConnectionPool:
    """Create database connection pool"""
    return AsyncConnectionPool(
        conninfo=DATABASE_URL,
        min_size=10,
        max_size=30,
        open=False,
    )


async def write_batch(conn: AsyncConnection, transactions: list[dict]) -> int:
    """Write a batch of transactions using COPY for maximum throughput"""
    if not transactions:
        return 0

    # COPY is 5-10x faster than INSERT for bulk loads
    copy_sql = """
        COPY transactions (
            surrogate_id, person_first_name, person_last_name, vendor_name,
            price_number_of_months, grace_number_of_months,
            original_transaction_amount, amount, vendor_transaction_id,
            client_settlement_status, vendor_settlement_status,
            transaction_delivery_status, partial_delivery,
            transaction_last_activity, transaction_financial_status, customer_id
        ) FROM STDIN
    """

    async with conn.cursor() as cur:
        async with cur.copy(copy_sql) as copy:
            for tx in transactions:
                row = (
                    tx.get("surrogate_id"),
                    tx.get("person_first_name"),
                    tx.get("person_last_name"),
                    tx.get("vendor_name"),
                    tx.get("price_number_of_months", 1),
                    tx.get("grace_number_of_months", 0),
                    tx.get("original_transaction_amount"),
                    tx.get("amount"),
                    tx.get("vendor_transaction_id"),
                    tx.get("client_settlement_status", "unpaid"),
                    tx.get("vendor_settlement_status", "unpaid"),
                    tx.get("transaction_delivery_status", "PENDING"),
                    tx.get("partial_delivery", False),
                    tx.get("transaction_last_activity", "REGULAR"),
                    tx.get("transaction_financial_status", "PENDING"),
                    tx.get("customer_id"),
                )
                await copy.write_row(row)

    return len(transactions)


async def process_messages(js, sub):
    """Process messages from JetStream subscription"""
    global running, pool

    batch = []
    batch_msgs = []
    last_flush = asyncio.get_event_loop().time()
    total_processed = 0
    start_time = asyncio.get_event_loop().time()

    print(f"[Consumer] Starting message processing loop...")

    while running:
        try:
            # Fetch messages with timeout
            try:
                msgs = await sub.fetch(batch=min(BATCH_SIZE - len(batch), 100), timeout=BATCH_TIMEOUT)
                for msg in msgs:
                    try:
                        tx = json.loads(msg.data.decode())
                        batch.append(tx)
                        batch_msgs.append(msg)
                    except json.JSONDecodeError as e:
                        print(f"[Consumer] Invalid JSON: {e}")
                        await msg.ack()  # Ack bad messages to avoid redelivery
            except nats.errors.TimeoutError:
                pass  # No messages available, check if we should flush

            current_time = asyncio.get_event_loop().time()
            should_flush = (
                len(batch) >= BATCH_SIZE or
                (len(batch) > 0 and current_time - last_flush >= BATCH_TIMEOUT)
            )

            if should_flush and batch:
                # Write batch to database
                async with pool.connection() as conn:
                    async with conn.transaction():
                        count = await write_batch(conn, batch)
                        total_processed += count

                # Acknowledge all messages in batch
                for msg in batch_msgs:
                    await msg.ack()

                elapsed = current_time - start_time
                tps = total_processed / elapsed if elapsed > 0 else 0
                print(f"[Consumer] Processed batch: {count} txns | Total: {total_processed} | TPS: {tps:.0f}")

                batch = []
                batch_msgs = []
                last_flush = current_time

        except Exception as e:
            print(f"[Consumer] Error processing batch: {e}")
            # NAK messages for redelivery on error
            for msg in batch_msgs:
                try:
                    await msg.nak()
                except:
                    pass
            batch = []
            batch_msgs = []
            await asyncio.sleep(1)  # Back off on error

    # Final flush on shutdown
    if batch:
        try:
            async with pool.connection() as conn:
                async with conn.transaction():
                    await write_batch(conn, batch)
            for msg in batch_msgs:
                await msg.ack()
            print(f"[Consumer] Final flush: {len(batch)} transactions")
        except Exception as e:
            print(f"[Consumer] Error in final flush: {e}")


async def run_consumer():
    """Main consumer loop"""
    global running, pool

    print("=" * 60)
    print("Transaction Consumer - NATS JetStream → TimescaleDB")
    print("=" * 60)
    print(f"NATS URL: {NATS_URL}")
    print(f"Database: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else DATABASE_URL}")
    print(f"Stream: {STREAM_NAME}")
    print(f"Subject: {SUBJECT}")
    print(f"Batch size: {BATCH_SIZE}")
    print()

    # Connect to database
    print("[Consumer] Connecting to database...")
    pool = await create_db_pool()
    await pool.open()
    print("[Consumer] Database connected")

    # Connect to NATS
    print("[Consumer] Connecting to NATS...")
    nc = await nats.connect(NATS_URL)
    js = nc.jetstream()
    print("[Consumer] NATS connected")

    # Ensure stream exists
    try:
        await js.stream_info(STREAM_NAME)
        print(f"[Consumer] Stream '{STREAM_NAME}' found")
    except nats.js.errors.NotFoundError:
        print(f"[Consumer] Creating stream '{STREAM_NAME}'...")
        await js.add_stream(
            name=STREAM_NAME,
            subjects=["aml.>"],
            retention="limits",
            max_age=30 * 24 * 60 * 60,
            max_bytes=2 * 1024**3,
            storage="file",
        )

    # Create durable consumer
    print(f"[Consumer] Creating consumer '{CONSUMER_NAME}'...")
    try:
        sub = await js.pull_subscribe(
            SUBJECT,
            durable=CONSUMER_NAME,
            config=ConsumerConfig(
                ack_policy=AckPolicy.EXPLICIT,
                deliver_policy=DeliverPolicy.ALL,
                max_ack_pending=MAX_PENDING,
                ack_wait=60,  # 60 seconds to process before redelivery
            ),
        )
        print(f"[Consumer] Subscribed to '{SUBJECT}'")
    except Exception as e:
        print(f"[Consumer] Error creating consumer: {e}")
        raise

    # Handle shutdown signals
    def signal_handler():
        global running
        print("\n[Consumer] Shutting down...")
        running = False

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, signal_handler)

    # Process messages
    print("[Consumer] Ready - waiting for messages...")
    await process_messages(js, sub)

    # Cleanup
    print("[Consumer] Cleaning up...")
    await nc.drain()
    await pool.close()
    print("[Consumer] Shutdown complete")


if __name__ == "__main__":
    asyncio.run(run_consumer())
