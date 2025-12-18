# Performance & Capacity

## Transaction Ingestion Throughput

Benchmarks performed with 4 transaction consumer replicas and TimescaleDB tuned for write-heavy workloads.

| Mode | TPS | Description |
|------|-----|-------------|
| **Sync** | ~1,100 | Direct DB write per request |
| **Async** | ~2,000 | Publish to NATS, consumer writes to DB |
| **Batch API** | ~15,000 | `/transactions/batch` endpoint (1000 txns/request) |
| **Sustained DB Write** | ~5,600 | 4 consumers writing via COPY |

### Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐     ┌─────────────┐
│  API        │────▶│  NATS        │────▶│  Transaction        │────▶│ TimescaleDB │
│  (FastAPI)  │     │  JetStream   │     │  Consumers (x4)     │     │             │
└─────────────┘     └──────────────┘     └─────────────────────┘     └─────────────┘
     │                                          │
     │ Batch size: 2000                         │ COPY (not INSERT)
     │ Batch timeout: 200ms                     │ Batch writes
     └──────────────────────────────────────────┘
```

## Database Capacity

### Current State

| Metric | Value |
|--------|-------|
| Transactions stored | 372,503 |
| Storage used | 130 MB |
| Average row size | ~365 bytes |
| Available disk | ~925 GB |
| Compression | Disabled |

### Estimated Capacity

| Scenario | Transactions | Storage |
|----------|--------------|---------|
| Current config (no compression) | ~500 million | ~180 GB |
| With 30% index overhead | ~400 million | ~180 GB |
| With TimescaleDB compression (10x) | ~4 billion | ~180 GB |
| Full disk utilization (80%) | ~2 billion | ~740 GB |

### Practical Limits

| Threshold | Recommendation |
|-----------|----------------|
| 50M rows | Review query performance, add indexes |
| 100M rows | Enable compression on old chunks |
| 500M rows | Increase shared_buffers to 2-4 GB |
| 1B rows | Add read replicas, consider sharding |

## Database Tuning (postgresql.conf)

Current configuration optimized for write-heavy workloads:

```ini
# Memory
shared_buffers = 512MB          # Increase to 2-4GB for production
work_mem = 64MB
maintenance_work_mem = 256MB
effective_cache_size = 1536MB

# Write Performance (critical)
synchronous_commit = off        # 2-3x faster writes, ~10ms data loss risk on crash
wal_writer_delay = 200ms
wal_level = replica
max_wal_size = 2GB
min_wal_size = 512MB
checkpoint_completion_target = 0.9
checkpoint_timeout = 15min

# Connections
max_connections = 200

# Background Writer
bgwriter_delay = 50ms
bgwriter_lru_maxpages = 400

# Autovacuum (tuned for high-write)
autovacuum_naptime = 30s
autovacuum_vacuum_threshold = 1000
autovacuum_vacuum_scale_factor = 0.1
```

## Tuning Recommendations

### For Higher Throughput

1. **Increase consumer replicas**
   ```yaml
   # docker-compose.yml
   transaction-consumer:
     deploy:
       replicas: 8  # Currently 4
   ```

2. **Larger batch sizes** (if latency tolerance allows)
   ```python
   # transaction_consumer.py
   BATCH_SIZE = 5000      # Currently 2000
   BATCH_TIMEOUT = 0.5    # Currently 0.2s
   ```

3. **More shared memory**
   ```yaml
   # docker-compose.yml
   timescaledb:
     shm_size: 2gb  # Currently 512mb
   ```

### For Larger Storage

1. **Enable compression** (10x reduction on old data)
   ```sql
   -- Enable compression on transactions hypertable
   ALTER TABLE transactions SET (
     timescaledb.compress,
     timescaledb.compress_segmentby = 'customer_id'
   );

   -- Compress chunks older than 7 days automatically
   SELECT add_compression_policy('transactions', INTERVAL '7 days');
   ```

2. **Add retention policy** (auto-delete old data)
   ```sql
   -- Keep only last 2 years
   SELECT add_retention_policy('transactions', INTERVAL '2 years');
   ```

3. **Increase shared_buffers for large datasets**
   ```ini
   # postgresql.conf
   shared_buffers = 4GB           # 25% of available RAM
   effective_cache_size = 12GB    # 75% of available RAM
   ```

### For Query Performance

1. **Add indexes for common queries**
   ```sql
   CREATE INDEX idx_txn_customer_created
     ON transactions (customer_id, created_at DESC);

   CREATE INDEX idx_txn_financial_status
     ON transactions (transaction_financial_status)
     WHERE transaction_financial_status = 'PENDING';
   ```

2. **Use continuous aggregates for dashboards**
   ```sql
   CREATE MATERIALIZED VIEW daily_transaction_stats
   WITH (timescaledb.continuous) AS
   SELECT
     time_bucket('1 day', created_at) AS day,
     count(*) as txn_count,
     sum(amount) as total_amount
   FROM transactions
   GROUP BY day;
   ```

## API Response Times

| Endpoint | Response Time |
|----------|---------------|
| `GET /transactions?limit=50` | ~50-65ms |
| `GET /transactions?limit=200` | ~50ms |
| `GET /customers` | ~50ms |
| `GET /alerts` | ~40ms |

## Summary

| Capability | Current | With Tuning |
|------------|---------|-------------|
| Ingestion TPS | 15,000 | 25,000+ |
| Sustained DB writes | 5,600 TPS | 10,000+ TPS |
| Storage capacity | 500M txns | 4B+ txns (compressed) |
| Query response | <100ms | <50ms (with indexes) |
