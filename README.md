# Noble Savings API

A backend service for managing group savings contributions, payment inflows, savings schedules, double-entry ledger accounting, and member payouts.

Built with **NestJS, TypeScript, PostgreSQL, and Jest**.

## Features

- **User registration:** Create member accounts with securely hashed passwords.
- **Savings memberships:** Create memberships under Ajo Weekly and Esusu Monthly savings groups.
- **Flexible contribution schedules:** Support daily, weekly, and monthly contribution frequencies.
- **Savings cycles:** Support monthly, quarterly, bi-annual, and annual cycles, subject to group rules.
- **Payment inflows:** Process payment-provider webhooks with duplicate detection and conflict handling.
- **Automatic allocation:** Allocate contributions against the oldest uncovered due dates first.
- **Credit management:** Retain excess contributions as member credit instead of silently applying them to another cycle.
- **Double-entry ledger:** Record financial transactions through balanced journal entries.
- **Idempotent payouts:** Prevent duplicate payouts, including concurrent requests.
- **Trial balance:** Retrieve account balances and verify that the ledger remains balanced.

## Technology Stack

| Technology | Purpose |
|---|---|
| Node.js | Runtime |
| TypeScript | Programming language |
| NestJS | Backend framework |
| PostgreSQL | Relational database |
| node-postgres (`pg`) | Database connectivity |
| class-validator | Request validation |
| PostgreSQL pgcrypto | Password hashing |
| Jest | Automated testing |

## Project Structure

```text
noble-savings/
├── db/
│   ├── 001_users.sql
│   ├── 002_seed_users.sql
│   ├── 003_groups.sql
│   ├── 004_memberships.sql
│   ├── 005_ledger_accounts.sql
│   ├── 006_journal.sql
│   ├── 007_inflows.sql
│   └── 008_payouts_keys_conflicts.sql
├── src/
│   ├── database/
│   ├── domain/
│   │   ├── allocation.ts
│   │   ├── dates.ts
│   │   └── schedule.ts
│   ├── health/
│   ├── ledger/
│   ├── memberships/
│   ├── payouts/
│   ├── users/
│   ├── webhooks/
│   ├── app.module.ts
│   └── main.ts
├── package.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js
- npm
- PostgreSQL 14 or later
- Git

### 1. Clone the repository

```bash
git clone https://github.com/Dnaux-dev/Noble-MFB.git
cd Noble-MFB
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create the PostgreSQL database

Create a database named `noble`:

```sql
CREATE DATABASE noble;
```

The database connection currently uses:

- Host: `localhost`
- Port: `5432`
- Database: `noble`
- Username: `ajilore`
- Password: supplied through `DB_PASSWORD`

Create the PostgreSQL role if it does not already exist:

```sql
CREATE ROLE ajilore WITH LOGIN PASSWORD 'your_database_password';
GRANT ALL PRIVILEGES ON DATABASE noble TO ajilore;
```

Connect to the database as an administrator and grant the role access to the public schema:

```sql
GRANT ALL ON SCHEMA public TO ajilore;
```

Set the database password in your terminal:

```bash
export DB_PASSWORD='your_database_password'
```

### 4. Run database migrations

Execute the SQL files in numerical order:

```bash
psql -U ajilore -d noble -f db/001_users.sql
psql -U ajilore -d noble -f db/002_seed_users.sql
psql -U ajilore -d noble -f db/003_groups.sql
psql -U ajilore -d noble -f db/004_memberships.sql
psql -U ajilore -d noble -f db/005_ledger_accounts.sql
psql -U ajilore -d noble -f db/006_journal.sql
psql -U ajilore -d noble -f db/007_inflows.sql
psql -U ajilore -d noble -f db/008_payouts_keys_conflicts.sql
```

The migrations create the required tables, indexes, constraints, triggers, ledger accounts, and seeded savings groups and users.

### 5. Start the application

For development:

```bash
npm run start:dev
```

For a production build:

```bash
npm run build
npm start
```

The API runs on:

```text
http://localhost:3000
```

## API Documentation

### Base URL

```text
http://localhost:3000
```

### 1. Health Check

Check whether the API can connect to PostgreSQL.

**GET** `/health/database`

Example:

```bash
curl http://localhost:3000/health/database
```

### 2. Register a User

Create a new member account.

**POST** `/users`

Request:

```json
{
  "email": "member@example.com",
  "full_name": "New Member",
  "password": "SecurePass123!"
}
```

Example:

```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "member@example.com",
    "full_name": "New Member",
    "password": "SecurePass123!"
  }'
```

Passwords are hashed using PostgreSQL's `pgcrypto` bcrypt functionality. Password hashes are not included in the registration response.

Email addresses are normalized to lowercase, and duplicate email registrations return HTTP `409 Conflict`.

> Registration creates an account; authentication and login endpoints are not currently implemented.

### 3. Create a Savings Membership

**POST** `/memberships`

Request:

```json
{
  "user_id": "USER_UUID",
  "group_id": "g-ajo",
  "frequency": "weekly",
  "cycle": "monthly",
  "contribution_kobo": 100000,
  "weekday": 5,
  "joined_on": "2026-11-01"
}
```

Example:

```bash
curl -X POST http://localhost:3000/memberships \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "USER_UUID",
    "group_id": "g-ajo",
    "frequency": "weekly",
    "cycle": "monthly",
    "contribution_kobo": 100000,
    "weekday": 5,
    "joined_on": "2026-11-01"
  }'
```

**Supported savings groups**

| Group | Minimum contribution | Supported frequencies | Supported cycles |
|---|---:|---|---|
| Ajo Weekly (`g-ajo`) | ₦1,000 | Daily, Weekly | Monthly, Quarterly, Bi-annual, Annual for weekly; monthly only for daily |
| Esusu Monthly (`g-esusu`) | ₦5,000 | Monthly | Quarterly, Bi-annual, Annual |

**Scheduling options**

- Daily: Contributions are due every calendar day, including weekends.
- Weekly: Specify `weekday` using ISO weekdays (Monday = 1, Sunday = 7).
- Monthly: Specify either `month_day` (1–28) or `month_last_day` (`true`).

A cycle begins on the first day of a month. Members joining on the first day enter the current month's cycle; members joining later enter the next month's cycle.

All monetary amounts are represented in integer kobo.

### 4. Retrieve Membership Details

**GET** `/memberships/:id`

Example:

```bash
curl http://localhost:3000/memberships/MEMBERSHIP_UUID
```

Returns membership information, including the associated savings group and member details.

### 5. Retrieve a Membership Schedule

**GET** `/memberships/:id/schedule`

Optional query parameter:

- `as_of`: Calendar date in `YYYY-MM-DD` format.

Example:

```bash
curl "http://localhost:3000/memberships/MEMBERSHIP_UUID/schedule?as_of=2026-11-15"
```

The response includes:

- Scheduled contribution dates.
- Expected contribution amounts.
- Amount covered.
- Outstanding amounts.
- Payment status for each due date.
- Total expected, paid, outstanding, and overflow amounts.

**Schedule statuses**

| Status | Meaning |
|---|---|
| `paid` | Fully covered by payments received on or before the due date. |
| `paid_late` | Fully covered, but only after the due date. |
| `partial` | Partially covered after the due date has passed. |
| `missed` | No payment covers the due date after it has passed. |
| `upcoming` | The due date has not yet become overdue. |

Payment status is determined using the payment's `received_at` timestamp, rather than the time the webhook was processed.

### 6. Process Payment Inflows

Payment providers can notify the service when a member makes a contribution.

**POST** `/webhooks/inflows`

Request:

```json
{
  "provider_ref": "PAYMENT-REF-001",
  "membership_id": "MEMBERSHIP_UUID",
  "amount_kobo": 300000,
  "received_at": "2026-11-04T10:00:00+01:00"
}
```

Example:

```bash
curl -X POST http://localhost:3000/webhooks/inflows \
  -H "Content-Type: application/json" \
  -d '{
    "provider_ref": "PAYMENT-REF-001",
    "membership_id": "MEMBERSHIP_UUID",
    "amount_kobo": 300000,
    "received_at": "2026-11-04T10:00:00+01:00"
  }'
```

**Inflow processing rules**

1. Each provider reference is unique.
2. Duplicate deliveries with the same reference and matching membership and amount are not processed twice.
3. Reusing a provider reference with a different membership or amount returns HTTP `409 Conflict` and records a data conflict.
4. Contributions are allocated against the oldest uncovered due dates first.
5. Amounts exceeding the expected contribution total are retained as member credit.
6. If the membership has already been paid out, new inflows are held as credit.

All inflow processing and ledger postings are performed within database transactions.

### 7. Request a Payout

**POST** `/memberships/:id/payout`

The payout endpoint requires an `Idempotency-Key` header.

Example:

```bash
curl -X POST http://localhost:3000/memberships/MEMBERSHIP_UUID/payout \
  -H "Idempotency-Key: payout-request-001"
```

**Payout rules**

- A payout is only permitted after the membership cycle has ended.
- The payout amount is derived from the membership's savings pool ledger balance.
- Member credit is excluded from the payout.
- A membership can only be paid out once.
- Repeating a request with the same idempotency key returns the original response.
- Concurrent payout requests cannot create multiple payouts for the same membership.

### 8. Retrieve the Trial Balance

**GET** `/ledger/trial-balance`

Example:

```bash
curl http://localhost:3000/ledger/trial-balance
```

Returns ledger account balances, total debits, total credits, the difference, and a boolean indicating whether the trial balance is balanced.

The ledger uses signed integer kobo amounts. Positive account balances are reported as debits and negative account balances as credits.

## Accounting Design

The service uses a double-entry accounting model.

Every journal transaction must contain at least two journal entries, and the sum of its entries must equal zero.

**Ledger account types**

| Account | Purpose |
|---|---|
| `provider_clearing` | Tracks incoming funds from payment providers. |
| `savings_pool` | Tracks a member's accumulated savings available for payout. |
| `credit` | Holds excess contributions that are not allocated to the savings pool. |
| `customer_payout` | Records funds paid out to a member. |

**Example: Processing an inflow**

For an incoming contribution of ₦3,000:

| Account | Amount |
|---|---:|
| Provider clearing | +300,000 kobo |
| Savings pool | -250,000 kobo |
| Member credit | -50,000 kobo |
| **Total** | **0 kobo** |

This ensures every financial transaction is balanced.

Journal entries and processed inflows are append-only. Database constraints and triggers enforce important accounting invariants.

## Date and Time Handling

- Business dates use the `Africa/Lagos` timezone.
- PostgreSQL timestamps are stored as timezone-aware UTC timestamps.
- Payment webhook timestamps must be RFC3339 timestamps containing a timezone.
- Contribution schedules use calendar dates rather than server-local timestamps.

## Validation and Error Handling

Request DTOs use `class-validator`.

The global validation pipeline:

- Removes no unexpected properties silently.
- Rejects unknown request fields.
- Validates request types and constraints.
- Transforms incoming request payloads.

Common HTTP responses include:

| Status | Meaning |
|---|---|
| `200` | Successful retrieval or idempotent replay. |
| `201` | Resource successfully created. |
| `400` | Invalid request or business rule violation. |
| `404` | Requested resource not found. |
| `409` | Duplicate resource or conflicting request. |

## Running Tests

Run the automated test suite:

```bash
npm test
```

Build the application:

```bash
npm run build
```

The tests cover domain date calculations, contribution schedules, payment allocation, database behaviour, ledger trial balance calculations, and user registration.

## Design Considerations

- **Money precision:** All financial amounts are stored in integer kobo to avoid floating-point currency calculations.
- **Concurrency:** Database transactions and row-level locking protect critical membership and payout operations.
- **Idempotency:** Provider references and payout idempotency keys prevent duplicate financial processing.
- **Auditability:** Journal entries are append-only, preserving the transaction history.
- **Data integrity:** PostgreSQL constraints and triggers enforce uniqueness and balanced journal transactions.
- **Separation of concerns:** Domain calculations are separated from NestJS controllers and database services.

## Repository

GitHub: https://github.com/Dnaux-dev/Noble-MFB

---

**Noble Savings API** — A group savings backend built around reliable contribution processing, transparent accounting, and safe payouts.