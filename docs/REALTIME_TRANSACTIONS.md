# Real-Time Transaction Display Implementation Guide

## Overview

This document outlines three approaches for displaying transactions in real-time without caching.

## Approach Comparison

| Approach | Real-Time | Complexity | Server Load | Best For |
|----------|-----------|------------|-------------|----------|
| **Server-Sent Events (SSE)** | ✅ True | Low | Low | Unidirectional updates (recommended) |
| **WebSockets** | ✅ True | Medium | Medium | Bidirectional communication |
| **Smart Polling** | ⚠️ Near real-time | Very Low | Medium-High | Quick implementation |

---

## 1. Server-Sent Events (SSE) - RECOMMENDED ⭐

### Why SSE?
- Designed for server-to-client streaming
- Perfect for transaction feeds
- Automatic reconnection built-in
- HTTP-based (no special infrastructure)
- Lower overhead than WebSockets for one-way data

### Backend Implementation (FastAPI)

```python
# src/api/streaming.py
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from psycopg import AsyncConnection
import asyncio
import json
from datetime import datetime
from typing import AsyncGenerator

router = APIRouter()

@router.get("/stream/transactions")
async def stream_transactions(conn: AsyncConnection):
    """
    Server-Sent Events endpoint for real-time transactions
    """
    async def event_generator() -> AsyncGenerator[str, None]:
        last_id = 0

        try:
            while True:
                # Query for new transactions since last_id
                async with conn.cursor() as cur:
                    await cur.execute("""
                        SELECT
                            t.id,
                            t.customer_id,
                            t.amount,
                            t.currency,
                            t.channel,
                            t.country,
                            t.merchant_category,
                            t.occurred_at,
                            c.full_name,
                            c.risk_level
                        FROM transactions t
                        JOIN customers c ON c.id = t.customer_id
                        WHERE t.id > %s
                        ORDER BY t.id ASC
                        LIMIT 50
                    """, (last_id,))

                    rows = await cur.fetchall()

                    if rows:
                        for row in rows:
                            # Format as SSE message
                            data = {
                                "id": row[0],
                                "customer_id": str(row[1]),
                                "amount": float(row[2]),
                                "currency": row[3],
                                "channel": row[4],
                                "country": row[5],
                                "merchant_category": row[6],
                                "occurred_at": row[7].isoformat(),
                                "customer_name": row[8],
                                "risk_level": row[9]
                            }

                            # SSE format: "data: {json}\n\n"
                            yield f"data: {json.dumps(data)}\n\n"
                            last_id = row[0]

                # Check every 500ms
                await asyncio.sleep(0.5)

        except asyncio.CancelledError:
            # Client disconnected
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )


@router.get("/stream/alerts")
async def stream_alerts(conn: AsyncConnection):
    """
    Server-Sent Events endpoint for real-time alerts
    """
    async def event_generator() -> AsyncGenerator[str, None]:
        last_id = 0

        try:
            while True:
                async with conn.cursor() as cur:
                    await cur.execute("""
                        SELECT
                            id,
                            customer_id,
                            type,
                            status,
                            severity,
                            scenario,
                            details,
                            created_at
                        FROM alerts
                        WHERE id > %s
                        ORDER BY id ASC
                        LIMIT 20
                    """, (last_id,))

                    rows = await cur.fetchall()

                    if rows:
                        for row in rows:
                            data = {
                                "id": row[0],
                                "customer_id": str(row[1]) if row[1] else None,
                                "type": row[2],
                                "status": row[3],
                                "severity": row[4],
                                "scenario": row[5],
                                "details": row[6],
                                "created_at": row[7].isoformat()
                            }

                            yield f"data: {json.dumps(data)}\n\n"
                            last_id = row[0]

                await asyncio.sleep(0.5)

        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )
```

### Register the Router

```python
# src/api/main.py
from .streaming import router as streaming_router

app.include_router(streaming_router, prefix="/api")
```

### Frontend Implementation (React/Vanilla JS)

```javascript
// React component
import { useEffect, useState } from 'react';

function TransactionsRealTime() {
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    // Create EventSource connection
    const eventSource = new EventSource('http://localhost:8000/api/stream/transactions');

    eventSource.onmessage = (event) => {
      const transaction = JSON.parse(event.data);

      // Add new transaction to the top
      setTransactions(prev => [transaction, ...prev].slice(0, 100)); // Keep last 100
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      eventSource.close();

      // Reconnect after 3 seconds
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <div className="transactions-list">
      <h2>Real-Time Transactions</h2>
      <div className="badge">
        <span className="pulse"></span> Live
      </div>

      {transactions.map(tx => (
        <div key={tx.id} className="transaction-card animate-slide-in">
          <div className="tx-amount">€{tx.amount.toLocaleString()}</div>
          <div className="tx-details">
            <span>{tx.channel}</span>
            <span>{tx.country}</span>
            <span>{tx.customer_name}</span>
          </div>
          <div className="tx-time">{new Date(tx.occurred_at).toLocaleTimeString()}</div>
        </div>
      ))}
    </div>
  );
}

export default TransactionsRealTime;
```

### Vanilla JavaScript Version

```javascript
// frontend/src/transactions-stream.js

const transactionsList = document.getElementById('transactions-list');
const liveIndicator = document.getElementById('live-indicator');

// Connect to SSE endpoint
const eventSource = new EventSource('http://localhost:8000/api/stream/transactions');

eventSource.onopen = () => {
  liveIndicator.classList.add('live');
  console.log('Connected to transaction stream');
};

eventSource.onmessage = (event) => {
  const transaction = JSON.parse(event.data);

  // Create transaction element
  const txElement = document.createElement('div');
  txElement.className = 'transaction-card fade-in';
  txElement.innerHTML = `
    <div class="tx-header">
      <span class="tx-id">#${transaction.id}</span>
      <span class="tx-time">${new Date(transaction.occurred_at).toLocaleTimeString()}</span>
    </div>
    <div class="tx-amount ${transaction.amount >= 10000 ? 'high-value' : ''}">
      €${transaction.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
    </div>
    <div class="tx-details">
      <span class="tx-channel">${transaction.channel}</span>
      <span class="tx-country">${transaction.country || 'N/A'}</span>
    </div>
    <div class="tx-customer">
      ${transaction.customer_name}
      <span class="risk-badge risk-${transaction.risk_level}">${transaction.risk_level}</span>
    </div>
  `;

  // Insert at top
  transactionsList.insertBefore(txElement, transactionsList.firstChild);

  // Keep only last 50 transactions
  while (transactionsList.children.length > 50) {
    transactionsList.removeChild(transactionsList.lastChild);
  }
};

eventSource.onerror = (error) => {
  console.error('Connection error:', error);
  liveIndicator.classList.remove('live');

  // Auto-reconnect
  setTimeout(() => {
    window.location.reload();
  }, 5000);
};
```

### CSS Animations

```css
/* Pulse indicator for live status */
.live-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.live-indicator.live::before {
  content: '';
  width: 8px;
  height: 8px;
  background: #10b981;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.2);
  }
}

/* Fade in animation for new transactions */
.transaction-card.fade-in {
  animation: fadeInSlide 0.3s ease-out;
}

@keyframes fadeInSlide {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.high-value {
  color: #ef4444;
  font-weight: bold;
}
```

---

## 2. WebSockets - For Bidirectional Communication

Use this if you need:
- Client to send updates back to server
- Multiple real-time channels
- More complex interactions

### Backend Implementation

```python
# src/api/websocket.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Set
import json
import asyncio

router = APIRouter()

# Keep track of connected clients
active_connections: Set[WebSocket] = set()

@router.websocket("/ws/transactions")
async def websocket_transactions(websocket: WebSocket):
    await websocket.accept()
    active_connections.add(websocket)

    try:
        last_id = 0

        while True:
            # Fetch new transactions
            async with get_connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("""
                        SELECT t.*, c.full_name, c.risk_level
                        FROM transactions t
                        JOIN customers c ON c.id = t.customer_id
                        WHERE t.id > %s
                        ORDER BY t.id ASC
                        LIMIT 10
                    """, (last_id,))

                    rows = await cur.fetchall()

                    if rows:
                        for row in rows:
                            data = {
                                "type": "transaction",
                                "data": {
                                    "id": row[0],
                                    "amount": float(row[2]),
                                    # ... other fields
                                }
                            }

                            await websocket.send_json(data)
                            last_id = row[0]

            await asyncio.sleep(0.5)

    except WebSocketDisconnect:
        active_connections.remove(websocket)

# Broadcasting function (call when transaction inserted)
async def broadcast_transaction(transaction_data: dict):
    """Broadcast to all connected clients"""
    disconnected = set()

    for connection in active_connections:
        try:
            await connection.send_json({
                "type": "transaction",
                "data": transaction_data
            })
        except:
            disconnected.add(connection)

    # Clean up disconnected
    active_connections.difference_update(disconnected)
```

### Frontend WebSocket Client

```javascript
// React WebSocket hook
import { useEffect, useState } from 'react';

function useTransactionStream() {
  const [transactions, setTransactions] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/transactions');

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'transaction') {
        setTransactions(prev => [message.data, ...prev].slice(0, 100));
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);

      // Reconnect after 3 seconds
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    };

    return () => {
      ws.close();
    };
  }, []);

  return { transactions, isConnected };
}
```

---

## 3. Smart Polling - Simplest Implementation

Use polling with timestamp-based queries and proper cache headers.

### Backend

```python
@app.get("/transactions/recent")
async def get_recent_transactions(
    since: Optional[datetime] = Query(None),
    conn: AsyncConnection = Depends(connection)
):
    """Get transactions since a specific timestamp"""
    if since is None:
        since = datetime.utcnow() - timedelta(minutes=5)

    query = """
        SELECT t.*, c.full_name, c.risk_level
        FROM transactions t
        JOIN customers c ON c.id = t.customer_id
        WHERE t.occurred_at > %s
        ORDER BY t.occurred_at DESC
        LIMIT 100
    """

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, (since,))
        rows = await cur.fetchall()

    # Set cache headers to prevent caching
    response = JSONResponse(content=rows)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"

    return response
```

### Frontend

```javascript
// Poll every 2 seconds
let lastUpdate = new Date().toISOString();

async function pollTransactions() {
  try {
    const response = await fetch(
      `http://localhost:8000/transactions/recent?since=${lastUpdate}`,
      {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      }
    );

    const newTransactions = await response.json();

    if (newTransactions.length > 0) {
      // Update UI with new transactions
      transactions.unshift(...newTransactions);
      lastUpdate = new Date().toISOString();
    }
  } catch (error) {
    console.error('Polling error:', error);
  }
}

// Start polling
setInterval(pollTransactions, 2000);
```

---

## Database Considerations

### Add Index for Efficient Querying

```sql
-- For ID-based queries (SSE/WebSocket)
CREATE INDEX idx_transactions_id_occurred ON transactions (id, occurred_at DESC);

-- For timestamp-based queries (polling)
CREATE INDEX idx_transactions_occurred_id ON transactions (occurred_at DESC, id);

-- For alerts
CREATE INDEX idx_alerts_id_created ON alerts (id, created_at DESC);
```

### PostgreSQL NOTIFY/LISTEN (Advanced)

For truly event-driven real-time updates:

```python
# Listen for database notifications
async def listen_for_transactions():
    async with await psycopg.AsyncConnection.connect(DSN) as conn:
        await conn.execute("LISTEN new_transaction")

        async for notify in conn.notifies():
            transaction_data = json.loads(notify.payload)
            # Broadcast to all SSE/WebSocket clients
            await broadcast_transaction(transaction_data)

# In your trigger
CREATE OR REPLACE FUNCTION notify_new_transaction()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('new_transaction', row_to_json(NEW)::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_transaction
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION notify_new_transaction();
```

---

## Recommendation

**For your AML platform, I recommend:**

1. **Start with SSE** (Server-Sent Events)
   - Simplest true real-time implementation
   - Perfect for transaction/alert feeds
   - Low overhead
   - Easy to add to existing setup

2. **Use continuous aggregates for dashboards**
   - Keep SSE for raw transaction feed
   - Query continuous aggregates for metrics/charts
   - Best of both worlds

3. **Add proper cache headers everywhere**
   ```python
   response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
   ```

4. **Consider hybrid approach**
   - SSE for real-time feed
   - Smart polling for historical data
   - Continuous aggregates for analytics

## Implementation Priority

1. ✅ Add cache-control headers to existing endpoints
2. ✅ Implement SSE endpoint for transactions
3. ✅ Update frontend to use EventSource
4. ⏭️ Add WebSockets later if needed for bidirectional features

Would you like me to implement the SSE endpoints for your existing FastAPI setup?
