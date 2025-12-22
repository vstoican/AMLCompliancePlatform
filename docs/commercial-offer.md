# Commercial Offer: AML Compliance Platform

## Executive summary

A comprehensive Anti-Money Laundering compliance solution designed for financial institutions. The platform provides real-time transaction monitoring, automated sanctions screening, configurable alert rules, and AI-powered analytics. Licensed on a transparent per-transaction basis.

---

## Platform capabilities

### Transaction monitoring

- Real-time transaction ingestion (single and batch up to 1,000 per request)
- Configurable alert rules with thresholds, time windows, and channel scope
- Pre-configured rules compliant with Romanian Law 129/2019:
  - Cash transactions ≥ €10,000
  - Cross-border transfers ≥ €10,000
  - Remittances ≥ €2,000
- Automatic alert generation via database triggers
- Support for multiple channels: cash, wire, transfer, remittance

### Sanctions screening

Automated screening against three global sanctions lists, synchronized every 24 hours:

| List | Source |
|------|--------|
| UN Consolidated Sanctions List | United Nations Security Council |
| OFAC SDN List | U.S. Treasury Department |
| EU Financial Sanctions Database | European Commission |

### Customer risk management

- Automated risk scoring using 7-factor model:
  - Geography risk (30% weight)
  - Product risk (20% weight)
  - Behavior risk (30% weight)
  - PEP flag detection
  - Sanctions hit detection
  - Adverse media flag
  - Manual override capability
- Risk levels: Low (< 40), Medium (40-69), High (≥ 70)
- Risk assessment history with audit trail
- KYC document expiry monitoring

### Alert lifecycle management

- Status workflow: Open → Assigned → In Progress → Escalated/On Hold → Resolved
- Resolution types: Confirmed suspicious, False positive, Not suspicious, Duplicate
- Notes and attachments on alerts
- Complete status history with timestamps and user attribution
- Escalation to senior analysts and managers

### Task management

- Task types: Investigation, KYC refresh, Document request, Escalation, SAR filing
- Kanban board and list views
- Claim/release functionality for self-assignment
- Priority levels and due date tracking
- Automated task creation from alert rules

### Workflow automation (Temporal-based)

- Schedule types: Cron-based, Event-triggered, Manual
- Pre-built workflows:
  - KYC Refresh (document expiry checking)
  - Sanctions Screening (hit detection and escalation)
  - Alert Handling (triage and investigation setup)
  - Investigation (task-linked workflows)
- Configurable timeouts, retry policies, and parameters
- Execution monitoring and history

### AI assistant

- Natural language queries on compliance data
- Powered by Claude (Anthropic)
- Database query generation and execution
- Multi-turn conversation support
- Risk analysis and pattern detection

### Dashboard and analytics

- Real-time metrics:
  - Total customers and high-risk count
  - Open alerts and pending tasks
  - Transaction volume
  - Risk distribution breakdown
- Recent alerts and transactions widgets
- Personalized task overview

### Reporting

- High-risk customers report
- Alert summary report with date range and severity filters
- Data export for compliance audits

### User management

- Role-based access control (Analyst, Senior Analyst, Manager, Admin)
- Custom role creation with granular permissions
- User enable/disable and password management
- Full audit trail on user actions

---

## Pricing

### Transaction-based licensing

| Monthly volume | Price per transaction |
|----------------|----------------------|
| Up to 1,000,000 | €0.05 |
| 1,000,001 – 2,000,000 | €0.045 |
| 2,000,000+ | €0.04 |

*Tiered pricing applies progressively*

**Included:**
- Unlimited users
- Sanctions screening (UN, OFAC, EU lists)
- AI assistant access
- Standard API access
- Email support

**Minimum monthly commitment:** €500

### Example monthly costs

| Transactions | Calculation | Monthly cost |
|--------------|-------------|--------------|
| 500,000 | 500K × €0.05 | €25,000 |
| 1,000,000 | 1M × €0.05 | €50,000 |
| 1,500,000 | (1M × €0.05) + (500K × €0.045) | €72,500 |
| 2,500,000 | (1M × €0.05) + (1M × €0.045) + (500K × €0.04) | €115,000 |

---

## Implementation services

### Historical data migration

| Service | One-time fee |
|---------|--------------|
| Load transactions from last 12 months | €5,000 |

**Includes:**
- Data mapping and transformation
- Quality validation and cleansing
- Initial risk scoring of historical customers
- Alert rule back-testing
- Migration completion report

### Optional services

| Service | Price |
|---------|-------|
| Onboarding and training (up to 10 users) | €1,500 |
| Custom alert rule configuration | €2,000 |
| API integration support (up to 40 hours) | €4,000 |
| Priority support (4-hour response SLA) | €500/month |

---

## Implementation timeline

| Phase | Duration | Activities |
|-------|----------|------------|
| Setup | Week 1 | Environment provisioning, access configuration |
| Migration | Week 2-3 | Historical data import, validation |
| Configuration | Week 4 | Alert rules, workflows, user setup |
| Go-live | Week 5 | Training, production launch |

---

## Technical specifications

- **Hosting:** EU-based cloud infrastructure (GDPR compliant)
- **Database:** PostgreSQL with TimescaleDB for high-volume transactions
- **Availability:** 99.5% uptime SLA
- **API:** RESTful API with JWT authentication
- **Sanctions sync:** Automatic daily updates (24-hour cycle)

---

## Terms

- **Contract duration:** 12 months minimum
- **Billing:** Monthly in arrears based on transaction volume
- **Payment terms:** Net 30 days
- **Data retention:** Configurable per regulatory requirements

---

## Next steps

1. Confirm estimated monthly transaction volume
2. Schedule platform demonstration
3. Define API integration requirements
4. Finalize commercial terms

---

**Valid until:** 21 January 2026
