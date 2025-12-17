# Quick Start: Transaction Simulator

Watch real-time transaction monitoring in action! 🚀

## ✨ Features

**Real-Time Updates with SSE**
- Transactions appear instantly as they're created
- Alerts trigger in real-time
- Live indicator shows connection status

**Guaranteed Event Delivery with JetStream**
- All events are persisted to disk
- No message loss even if NATS restarts
- Every event is acknowledged (see logs for `✅ Published` messages)

## Step 1: Open the Web UI

Open your browser:
```
http://localhost:4173
```

Navigate to the **Transactions** tab.

**Look for the green "Live" indicator** - this means SSE is connected!

## Step 2: Clear Data (Optional)

Start fresh:
```bash
bash tools/reset_db.sh
```

## Step 3: Run Simulator

```bash
python tools/simulator.py
```

## Step 4: Watch in Real-Time! 👀

**NEW: No refresh needed!** Transactions and alerts stream automatically.

While the simulator runs:
1. **Keep the browser open** on the Transactions tab
2. **Watch transactions appear instantly** as they're created (no refresh!)
3. **Switch to Alerts tab** to see alerts triggering in real-time
4. **Open browser console (F12)** to see SSE connection logs:
   ```
   ✅ Transaction stream connected
   📊 New transaction received: {id: 1, amount: 372.21, ...}
   🚨 New alert received: {id: 1, severity: "high", ...}
   ```

**The green "Live" indicator** shows you're connected to the real-time stream!

## What You'll See

### Terminal Output (Simulator)
```
━━━ Scenario: Large Cash Transaction ━━━
⚠  Sending: €13,648.93 CASH (should trigger alert)
🚨 ALERT TRIGGERED: transaction_monitoring
   Severity: high
   Details: {
     "definition_code": "CASH_OVER_10K_EUR",
     "amount": 13648.93,
     "threshold_amount": 10000.0
   }
```

### Browser (Web UI)
- **Transactions Tab**: List of all generated transactions
- **Alerts Tab**: Triggered alerts with severity and status
- **Customers Tab**: Test customers created by simulator

## Reset and Run Again

```bash
# Clear everything
bash tools/reset_db.sh

# Run another simulation
python tools/simulator.py

# Refresh browser to see new data
```

## Scenarios Generated

Each simulator run creates:
1. ✅ Normal transactions (5x) - No alerts
2. 💰 Large cash transaction (~€12k) - **HIGH** severity alert
3. 🌍 Cross-border wire transfer (~€15k) - **HIGH** severity alert
4. 📤 Large remittance (~€3k) - **MEDIUM** severity alert
5. ⚡ High velocity burst (15-20 rapid transactions)

**Total: ~24 transactions, 3-4 alerts per run**

## Continuous Aggregates in Action

While you're watching, TimescaleDB is computing real-time metrics:
- Hourly transaction volumes (refreshes every 10 min)
- Daily customer summaries (refreshes every hour)
- System-wide metrics (refreshes every 15 min)
- Alert statistics (refreshes every 30 min)

View these in the database:
```bash
docker-compose exec -T timescaledb psql -U aml_user -d aml -c "
SELECT * FROM transactions_hourly
WHERE bucket >= NOW() - INTERVAL '1 hour'
LIMIT 5;
"
```

## Troubleshooting

**UI not loading?**
```bash
docker-compose ps frontend
# Should show "Up"
```

**No transactions appearing?**
```bash
# Check simulator output for errors
# Verify API is running:
curl http://localhost:8000/health
```

**Need help?**
See the full documentation: `tools/README.md`
