# AML Transaction Simulator

Tool for testing and demonstrating the AML Compliance Platform's real-time transaction monitoring and alert generation capabilities.

## Overview

The **`simulator.py`** script generates realistic transaction patterns that trigger alerts. Watch transactions and alerts appear in real-time in the web UI!

## Prerequisites

```bash
# 1. Start all services
docker-compose up -d

# 2. Install simulator dependencies
pip install -r tools/requirements.txt

# 3. Verify API is running
curl http://localhost:8000/health
```

## Quick Start

### Step 1: Open the Web UI

Open your browser and navigate to:
```
http://localhost:4173
```

You'll see the AML Compliance Platform dashboard with tabs for:
- **Customers**
- **Transactions** ← Watch here!
- **Alerts** ← And here!
- **Alert Definitions**
- **Reports**

### Step 2: Clear Database (Optional - Fresh Start)

If you want to start with a clean slate:

```bash
bash tools/reset_db.sh
```

Or manually:
```bash
docker-compose exec -T timescaledb psql -U aml_user -d aml <<EOF
TRUNCATE TABLE alerts RESTART IDENTITY CASCADE;
TRUNCATE TABLE transactions RESTART IDENTITY CASCADE;
TRUNCATE TABLE customers RESTART IDENTITY CASCADE;
EOF
```

### Step 3: Run the Simulator

In your terminal:
```bash
python tools/simulator.py
```

The simulator will:
1. Create a test customer
2. Run 5 different scenarios
3. Generate 20+ transactions
4. Trigger multiple alerts

### Step 4: Watch in Real-Time! 🎬

Switch to your browser and watch:
- **Transactions tab**: See transactions appearing as they're created
- **Alerts tab**: See alerts triggering in real-time
- Refresh the page to see the latest data

**That's it!** No need for separate monitoring tools - just watch the UI update in real-time.

## Usage

### Transaction Simulator

The simulator generates realistic transaction patterns designed to trigger different types of alerts.

```bash
# Run all scenarios
python tools/simulator.py
```

**Scenarios included:**

1. **Normal Activity** - Low-value transactions that shouldn't trigger alerts
2. **Cash Over €10k** - Large cash transaction (triggers `CASH_OVER_10K_EUR` alert)
3. **Cross-Border Transfer** - Large international wire transfer (triggers `EXTERNAL_TRANSFER_OVER_10K_EUR`)
4. **Remittance** - Large remittance payment (triggers `REMITTANCE_OVER_2K_EUR`)
5. **High Velocity** - Burst of rapid transactions (velocity pattern)

**Output:**
```
━━━ Scenario: Large Cash Transaction ━━━
⚠  Sending: €12,345.67 CASH (should trigger alert)
🚨 ALERT TRIGGERED: CASH_OVER_10K_EUR
   Severity: high
   Details: {
     "amount": 12345.67,
     "threshold": 10000,
     "currency": "EUR"
   }
```

### Viewing in the Web UI

The web UI (http://localhost:4173) provides:

**Transactions Tab:**
- List of all transactions with details
- Amount, channel, country, merchant category
- Customer information
- Timestamp

**Alerts Tab:**
- All triggered alerts
- Color-coded severity (high, medium, low)
- Status tracking (OPEN, INVESTIGATING, ESCALATED, CLOSED)
- Detailed alert information
- Quick filtering options

**Alert Definitions Tab:**
- View configured alert rules
- See thresholds and conditions
- Enable/disable specific alerts

**Tip:** Keep the browser tab open and refresh periodically while running the simulator to see transactions and alerts appear!

### Running Multiple Simulations

You can run the simulator multiple times to generate more data:

```bash
# Run first simulation
python tools/simulator.py

# Refresh the web UI to see new transactions

# Run another simulation (creates a new customer)
python tools/simulator.py

# Keep refreshing the web UI to see all transactions accumulate
```

Each run creates a new test customer and generates 20+ transactions.

## How It Works

### Alert Triggering

Alerts are triggered automatically by the database trigger function `evaluate_transaction_alerts()` (defined in migration V2). When a transaction is inserted:

1. Transaction hits the API (`POST /transactions`)
2. Database trigger evaluates all enabled alert definitions
3. If conditions match (amount, channel, country, time window), an alert is created
4. Alert appears immediately in the monitor dashboard

### Continuous Aggregates

The platform uses TimescaleDB continuous aggregates (defined in migration V4) to compute real-time metrics:

- **transactions_hourly** - Hourly aggregates per customer (refreshes every 10 min)
- **customer_daily_summary** - Daily rollups (refreshes every hour)
- **global_hourly_metrics** - System-wide metrics (refreshes every 15 min)
- **alert_hourly_stats** - Alert statistics (refreshes every 30 min)

These aggregates enable fast queries for velocity checks, pattern detection, and compliance reporting.

## Customization

### Adjust Simulation Speed

Edit `simulator.py`:
```python
SIMULATION_SPEED = 2.0  # 2x speed (faster)
SIMULATION_SPEED = 0.5  # 0.5x speed (slower)
```

### Adjust Monitor Refresh Rate

Edit `monitor.py`:
```python
REFRESH_INTERVAL = 1  # Refresh every 1 second (faster)
REFRESH_INTERVAL = 5  # Refresh every 5 seconds (slower)
```

### Create Custom Scenarios

Add new scenarios to `simulator.py`:

```python
async def run_scenario_custom(self) -> None:
    """Scenario: Your custom pattern"""
    console.print("\n[cyan]━━━ Scenario: Custom Pattern ━━━[/cyan]")
    generator = TransactionGenerator(self.customer_id)

    # Your transaction generation logic
    for i in range(10):
        tx = {
            "customer_id": str(self.customer_id),
            "amount": 5000 + i * 100,
            "currency": "EUR",
            "channel": "WIRE",
            "country": "US",
        }
        await self.send_transaction(tx)
        await asyncio.sleep(0.5)
```

## Querying Metrics

You can also query the continuous aggregates directly:

```bash
# Connect to database
docker-compose exec timescaledb psql -U aml_user -d aml

# Query hourly metrics for a customer
SELECT bucket, transaction_count, total_amount, high_value_count
FROM transactions_hourly
WHERE customer_id = 'your-customer-id'
  AND bucket >= NOW() - INTERVAL '24 hours'
ORDER BY bucket DESC;

# Find customers with suspicious patterns today
SELECT customer_id,
       daily_high_value_count,
       daily_cross_border_amount
FROM customer_daily_summary
WHERE day = CURRENT_DATE
  AND (daily_high_value_count > 5 OR daily_cross_border_amount > 50000);

# System-wide metrics
SELECT bucket, total_transactions, active_customers, total_volume
FROM global_hourly_metrics
WHERE bucket >= NOW() - INTERVAL '24 hours'
ORDER BY bucket DESC;
```

## Troubleshooting

### Web UI Not Loading

Make sure all services are running:
```bash
docker-compose ps

# Expected output should show all services as "Up"
# Especially: api, frontend, timescaledb
```

Access URLs:
- **Frontend**: http://localhost:4173
- **API**: http://localhost:8000
- **API Health**: http://localhost:8000/health

### API Connection Failed

Make sure the API is running:
```bash
docker-compose ps api
curl http://localhost:8000/health
```

### No Alerts Triggered

Check alert definitions are enabled:
```bash
curl http://localhost:8000/alert-definitions
```

Or view them in the web UI under **Alert Definitions** tab.

### Transactions Not Showing in UI

1. Verify transactions are being created:
```bash
curl http://localhost:8000/transactions?limit=10
```

2. Check the database directly:
```bash
docker-compose exec -T timescaledb psql -U aml_user -d aml -c "SELECT COUNT(*) FROM transactions;"
```

3. Refresh your browser (F5 or Cmd+R)

4. Check browser console for errors (F12 → Console tab)

## Architecture

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  Simulator   │─────>│   FastAPI    │─────>│ TimescaleDB  │
│              │ POST │              │ SQL  │              │
│ - Scenarios  │ /tx  │ - REST API   │      │ - Hypertable │
│ - Patterns   │      │ - Validation │      │ - Triggers   │
└──────────────┘      └──────────────┘      └──────┬───────┘
                                                    │
                             ┌──────────────────────┘
                             │ Alert Trigger
                             │ (evaluate_transaction_alerts)
                             ▼
┌──────────────┐      ┌──────────────┐
│   Monitor    │<─────│    Alerts    │
│              │ GET  │    Table     │
│ - Dashboard  │ /api │              │
│ - Live View  │      │ - Status     │
└──────────────┘      └──────────────┘
```

## Next Steps

- Add more sophisticated transaction patterns (structuring, layering)
- Implement machine learning-based anomaly detection scenarios
- Add network analysis patterns (multiple customers)
- Create automated testing scenarios for CI/CD
- Export simulation results for analysis

## License

Part of the AML Compliance Platform
