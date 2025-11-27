# AML Compliance Platform (MVP)

FastAPI service backed by TimescaleDB for transaction storage, Temporal for background workflows, and NATS for optional event streaming. Ships with a minimal case-management flow (alerts, KYC tasks, risk scoring).

## Running locally
```bash
docker-compose up --build
```
- API available at http://localhost:8000/docs  
- Frontend UI at http://localhost:4173 (static, no build step)
- TimescaleDB exposed on `localhost:5434`
- Temporal UI at http://localhost:8080
- NATS exposed on `4222` (JetStream enabled)
- Flyway runs automatically before the API/worker start; rerun migrations with `docker-compose run --rm flyway migrate`

## Key pieces
- `src/api/main.py` FastAPI endpoints for customers, risk scoring, transactions, alerts, KYC tasks, and reports.
- `src/api/risk.py` Basic AML risk scoring (auto + manual override).
- `db/migrations/V1__initial_schema.sql` Schema bootstrap with Timescale hypertable for `transactions`.
- `src/workflows/worker.py` Temporal worker with sample workflows (KYC refresh, sanctions alert stub).
- `frontend/` Static ops console (dashboard, customers, transactions, alerts, KYC, reports).

## Database migrations
- Migration files live in `db/migrations` following Flyway's `V__` naming convention.
- `db/flyway.conf` contains defaults for the docker-compose environment; override via `FLYWAY_*` env vars as needed.
- Run migrations manually (if needed) with `docker-compose run --rm flyway migrate`.

## Example requests
Create a customer and compute risk automatically:
```bash
curl -X POST http://localhost:8000/customers \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Ana Ionescu","country":"RO","id_document_expiry":"2025-05-01","indicators":{"geography_risk":3,"product_risk":2,"behavior_risk":4,"pep_flag":true}}'
```

Ingest a transaction (Timescale hypertable):
```bash
curl -X POST http://localhost:8000/transactions \
  -H "Content-Type: application/json" \
  -d '{"customer_id":"<id>","amount":12000,"currency":"EUR","country":"GB","channel":"card"}'
```

KYC expiry check and alert reporting:
```bash
curl -X POST http://localhost:8000/kyc/run?days_before_expiry=45
curl -X GET http://localhost:8000/reports/alerts
```

## Temporal workflows
- Task queue: `aml-tasks`
- Workflows: `KycRefreshWorkflow`, `SanctionsScreeningWorkflow`
- Start a run with the Temporal CLI or UI, e.g. from the Temporal container:
  ```bash
  tctl --address temporal:7233 workflow start \
    --taskqueue aml-tasks \
    --type KycRefreshWorkflow \
    --workflow_id kyc-refresh-sample \
    --input '"<customer-id>"'
  ```

## Notes
- NATS publishing is best-effort; API keeps working if broker is offline.
- Alerting rules are intentionally simple (large transaction, geography mismatch, high-risk customer). Expand in `evaluate_transaction`.
