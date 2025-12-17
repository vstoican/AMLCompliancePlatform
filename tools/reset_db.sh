#!/bin/bash
# Reset database - Clear all transactions, alerts, and customers

set -e

echo "🔄 Resetting AML database..."
echo ""

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose not found"
    exit 1
fi

# Check if containers are running
if ! docker-compose ps timescaledb | grep -q "Up"; then
    echo "❌ TimescaleDB container is not running"
    echo "   Run: docker-compose up -d"
    exit 1
fi

echo "📊 Current database stats:"
docker-compose exec -T timescaledb psql -U aml_user -d aml -c "
    SELECT
        'Customers' as table_name, COUNT(*) as count FROM customers
    UNION ALL
    SELECT 'Transactions', COUNT(*) FROM transactions
    UNION ALL
    SELECT 'Alerts', COUNT(*) FROM alerts;
" 2>/dev/null

echo ""

# Check if running in non-interactive mode (e.g., piped input)
if [ -t 0 ]; then
    # Interactive mode
    read -p "⚠️  This will delete all customers, transactions, and alerts. Continue? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Reset cancelled"
        exit 0
    fi
else
    # Non-interactive mode, ask for confirmation
    read -r REPLY
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Reset cancelled"
        exit 0
    fi
fi

echo ""
echo "🗑️  Truncating tables..."

docker-compose exec -T timescaledb psql -U aml_user -d aml <<EOF
-- Truncate all transactional data
TRUNCATE TABLE alerts RESTART IDENTITY CASCADE;
TRUNCATE TABLE transactions RESTART IDENTITY CASCADE;
TRUNCATE TABLE customers RESTART IDENTITY CASCADE;
TRUNCATE TABLE risk_assessments RESTART IDENTITY CASCADE;
TRUNCATE TABLE kyc_tasks RESTART IDENTITY CASCADE;

-- Note: Alert definitions are kept intact
-- Continuous aggregates will auto-refresh
EOF

if [ $? -eq 0 ]; then
    echo "✅ Database reset complete!"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Run the simulator: python tools/simulator.py"
    echo "   2. Or create customers via API: curl -X POST http://localhost:8000/customers"
    echo ""
    echo "ℹ️  Alert definitions remain intact:"
    docker-compose exec -T timescaledb psql -U aml_user -d aml -t -c "SELECT COUNT(*) FROM alert_definitions;" 2>/dev/null | xargs echo "   Alert rules:"
else
    echo "❌ Reset failed"
    exit 1
fi
