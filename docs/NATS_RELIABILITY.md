# NATS Reliability Analysis for AML Platform

## Current Situation ⚠️

Your current NATS implementation **CAN and WILL lose messages**.

### What's Being Published

```python
# From main.py - these events can be lost:
await publish_event("aml.transaction.ingested", {...})
await publish_event("aml.customer.created", {...})
await publish_event("aml.customer.risk", {...})
await publish_event("aml.kyc.tasks.created", {...})
```

### Current Implementation

```python
# src/api/events.py
async def publish_event(subject: str, payload: dict[str, Any]) -> None:
    try:
        nc = NATS()
        await nc.connect(servers=[settings.nats_url], connect_timeout=1)
        await nc.publish(subject, str(payload).encode())  # ⚠️ Fire-and-forget
        await nc.drain()
    except Exception:
        return  # ⚠️ Silently drops on error!
```

**Problems:**
1. ❌ No persistence (messages lost on restart)
2. ❌ No acknowledgment (no confirmation of delivery)
3. ❌ No redelivery (if subscriber is down)
4. ❌ Silently drops messages on error
5. ❌ At-most-once delivery (can lose messages)
6. ❌ Not using JetStream (despite it being enabled!)

## When Messages Get Lost

### Scenario 1: NATS Server Restart
```
1. API publishes event "aml.transaction.ingested"
2. NATS receives it (in memory)
3. NATS crashes/restarts
4. ❌ Event is lost forever
```

### Scenario 2: No Subscribers
```
1. API publishes event "aml.kyc.tasks.created"
2. NATS receives it
3. No subscribers are listening
4. ❌ Event is dropped (never processed)
```

### Scenario 3: Network Timeout
```
1. API tries to publish event
2. Connection times out (>1 second)
3. Exception caught and suppressed
4. ❌ Event is lost, no retry
```

### Scenario 4: Subscriber Crashes
```
1. API publishes event
2. Subscriber receives it
3. Subscriber crashes before processing
4. ❌ Event is lost (no redelivery)
```

## Is Your Transaction Data Safe?

**YES!** Your actual transaction data is safe because:

✅ Transactions are written to **PostgreSQL first**
✅ TimescaleDB provides ACID guarantees
✅ Database has persistence and backups
✅ Alerts are triggered by database triggers

**The NATS events are just notifications** - they don't store the source of truth.

## But Here's the Risk...

If you're planning to use NATS events for:
- **Audit logging** → Could lose audit trail
- **Compliance reporting** → Could miss events
- **External system integration** → Could miss notifications
- **Event sourcing** → Could lose events
- **Analytics pipelines** → Could have data gaps

→ **This is dangerous for a compliance platform!**

## Options

### Option 1: Remove NATS (Simplest) ✅ RECOMMENDED

**Current usage:** Fire-and-forget notifications (not consumed anywhere)

**Recommendation:** Remove NATS until you actually need it.

**Benefits:**
- Simpler architecture
- Fewer failure points
- Lower operational overhead
- No message loss concerns

**When to add it back:**
- Multiple services need to communicate
- Need event-driven architecture
- Scaling to multiple API instances

**How:**
```python
# Replace publish_event with logging
import logging

async def publish_event(subject: str, payload: dict):
    logging.info(f"Event: {subject} - {payload}")
    # Or just remove these calls entirely
```

### Option 2: Use JetStream (Reliable) ⚠️ IF YOU NEED NATS

**Use JetStream for guaranteed delivery.**

**Benefits:**
- At-least-once delivery
- Persistent storage (disk)
- Message acknowledgment
- Automatic redelivery
- Replay capability

**Implementation:** See `src/api/events_jetstream.py`

**How to migrate:**
```python
# Before (lossy)
await publish_event("aml.transaction.ingested", {...})

# After (reliable)
from .events_jetstream import publish_event_reliable
success = await publish_event_reliable("aml.transaction.ingested", {...})
if not success:
    logging.error("Failed to publish event!")
```

### Option 3: PostgreSQL NOTIFY/LISTEN (Database-native)

**Use PostgreSQL's built-in pub/sub.**

**Benefits:**
- Built into your database
- ACID guarantees
- No external dependency
- Transactional (won't lose messages)

**Implementation:**
```sql
-- In your trigger
CREATE OR REPLACE FUNCTION notify_transaction()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('aml.transaction.ingested', row_to_json(NEW)::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_transaction
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION notify_transaction();
```

```python
# Python listener
async def listen_for_events():
    async with await psycopg.AsyncConnection.connect(DSN) as conn:
        await conn.execute("LISTEN aml.transaction.ingested")
        async for notify in conn.notifies():
            data = json.loads(notify.payload)
            # Process event
```

**Limitations:**
- Only within single PostgreSQL instance
- No persistence (if listener is down, events are lost)
- Not suitable for cross-service communication

### Option 4: Database Outbox Pattern (Production-Grade)

**Store events in database, publish from there.**

```sql
CREATE TABLE event_outbox (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    published BOOLEAN DEFAULT FALSE
);
```

```python
# In transaction
async with conn.transaction():
    # Insert transaction
    await cur.execute("INSERT INTO transactions ...")

    # Insert event (same transaction!)
    await cur.execute("""
        INSERT INTO event_outbox (event_type, payload)
        VALUES (%s, %s)
    """, ("aml.transaction.ingested", json.dumps(payload)))

# Background worker publishes from outbox
async def outbox_publisher():
    while True:
        # Get unpublished events
        events = await fetch_unpublished_events()
        for event in events:
            success = await publish_to_nats(event)
            if success:
                await mark_as_published(event.id)
        await asyncio.sleep(1)
```

**Benefits:**
- ✅ ACID guarantees (events and data in same transaction)
- ✅ No message loss (events stored in database)
- ✅ Retry logic
- ✅ Exactly-once semantics possible

**Drawbacks:**
- More complex
- Requires background worker

## My Recommendation

### For Your AML Platform:

**Right Now:**
1. **Remove NATS** - It's not doing anything useful
   - No consumers are reading these events
   - Fire-and-forget with no guarantees
   - Just extra complexity

**Later (if needed):**
2. **Use JetStream** when you have:
   - Multiple services that need events
   - External integrations
   - Event-driven workflows

3. **Use Outbox Pattern** for:
   - Critical compliance events
   - Audit trail requirements
   - Guaranteed delivery needs

### Implementation Priority

```
Phase 1 (Now):
✅ SSE for real-time UI updates (already done)
✅ Database triggers for alerts (already done)
✅ PostgreSQL for source of truth (already done)
❌ Remove NATS (not being used properly)

Phase 2 (When scaling):
- Add JetStream for inter-service communication
- Add event consumers
- Add proper error handling

Phase 3 (Production compliance):
- Add outbox pattern for critical events
- Add event sourcing for audit trail
- Add message replay capability
```

## Testing Current Implementation

Want to see how it loses messages?

```bash
# Terminal 1: Stop NATS
docker-compose stop nats

# Terminal 2: Create a customer via API
curl -X POST http://localhost:8000/customers \
  -H "Content-Type: application/json" \
  -d '{"full_name": "Test User", "email": "test@example.com"}'

# Result: Customer created ✅
# But event "aml.customer.created" never published ❌
# No error shown! Silent failure!
```

## Summary

| Approach | Reliability | Complexity | When to Use |
|----------|-------------|------------|-------------|
| **Current NATS** | ❌ Lossy | Low | Never for compliance |
| **Remove NATS** | ✅ N/A | Lowest | Now (not being used) |
| **JetStream** | ✅ Reliable | Medium | Multi-service |
| **PG NOTIFY** | ⚠️ Lossy | Low | Single instance |
| **Outbox Pattern** | ✅ Guaranteed | High | Production compliance |

**For AML compliance:** Never use at-most-once delivery. Either use reliable messaging (JetStream, Outbox) or don't use messaging at all.

---

**Want me to:**
1. Remove NATS from the project? (Simplify)
2. Implement JetStream properly? (Make it reliable)
3. Implement Outbox Pattern? (Production-grade)
