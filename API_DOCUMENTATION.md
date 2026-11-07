# Noble MFB API Documentation

Live API base URL: `https://noble-mfb-api.onrender.com`

This is a REST API for the Noble MFB savings backend. It supports user registration and authentication, savings memberships, contribution inflows, payouts, and ledger reporting.

## Quick start

1. Import `Noble-MFB-Postman-Collection.json` into Postman.
2. Import `Noble-MFB-Postman-Environment.json` and select **Noble MFB - Production**.
3. Run **Health → Database health** to confirm the service is reachable.
4. Register a test user, then run **Users & Authentication → Login**. The collection saves the returned JWT automatically as `accessToken`.
5. Run **Create weekly Ajo membership**. The collection saves its ID as `membershipId`.
6. Use the remaining requests to inspect the membership, schedule, record an inflow, and inspect the ledger.

The Postman examples are starting values. Use a unique email and `provider_ref` when repeating registration or inflow tests. Do not use a real customer's personal information for demonstrations.

## Authentication

The API issues JWT bearer tokens from `POST /auth/login`. The token expires after one hour. Include it on protected routes:

```http
Authorization: Bearer <access_token>
```

Protected routes:
- `GET /auth/me`
- `POST /memberships`
- `GET /memberships/:id`
- `GET /memberships/:id/schedule`
- `POST /memberships/:id/payout`

Membership operations are scoped to the authenticated user. The `user_id` in a membership creation request must match the JWT subject.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health/database` | Public | Database connectivity check |
| POST | `/users` | Public | Register a user |
| POST | `/auth/login` | Public | Obtain JWT |
| GET | `/auth/me` | Bearer | Get authenticated profile |
| POST | `/memberships` | Bearer | Create savings membership |
| GET | `/memberships/:id` | Bearer | Get owned membership |
| GET | `/memberships/:id/schedule` | Bearer | Get contribution schedule |
| POST | `/webhooks/inflows` | Public currently | Record contribution inflow |
| POST | `/memberships/:id/payout` | Bearer | Request cycle payout |
| GET | `/ledger/trial-balance` | Public | Read ledger trial balance |

### 1. Health check

`GET /health/database`

Example response:

```json
{
  "status": "ok",
  "database": "noble_poqm",
  "username": "noble_poqm_user"
}
```

The database and username values depend on the deployed database configuration.

### 2. Register user

`POST /users`

Request:

```json
{
  "email": "ada@example.com",
  "full_name": "Ada Obi",
  "password": "Password123!"
}
```

Validation:
- `email`: valid email, maximum 254 characters.
- `full_name`: string, 2–100 characters.
- `password`: string, 8–72 characters.

Successful response (HTTP 201) contains `message` and a `user` object with public fields (`id`, `email`, `full_name`, `created_at`). Password hashes are not returned. A duplicate email returns HTTP 409.

### 3. Login

`POST /auth/login`

Request:

```json
{
  "email": "ada@example.com",
  "password": "Password123!"
}
```

Successful response (HTTP 201) contains:
- `message`
- `access_token`
- `token_type` (`Bearer`)
- `user`

Invalid credentials return HTTP 401. JWT lifetime is one hour.

### 4. Get current profile

`GET /auth/me`

Requires bearer authentication. Returns the authenticated user's profile. A missing/deleted user account returns HTTP 401.

### 5. Create membership

`POST /memberships`

Requires bearer authentication. The `user_id` must be the ID of the authenticated user.

Example weekly Ajo request:

```json
{
  "user_id": "<authenticated-user-uuid>",
  "group_id": "g-ajo",
  "frequency": "weekly",
  "cycle": "monthly",
  "contribution_kobo": 100000,
  "weekday": 5,
  "joined_on": "2026-11-07"
}
```

Fields:
- `user_id`: UUID of the authenticated user.
- `group_id`: `g-ajo` or `g-esusu`.
- `frequency`: `daily`, `weekly`, or `monthly`.
- `cycle`: `monthly`, `quarterly`, `bi_annual`, or `annual`.
- `contribution_kobo`: positive integer in kobo.
- `weekday`: required for weekly frequency; integer 1–7.
- `month_day`: optional monthly day, integer 1–28.
- `month_last_day`: optional boolean.
- `joined_on`: strict date string (`YYYY-MM-DD`).

Group rules enforced by the service:
- `g-ajo`: minimum 100000 kobo (₦1,000); supports daily/monthly-cycle or weekly with any supported cycle.
- `g-esusu`: minimum 500000 kobo (₦5,000); supports monthly frequency with quarterly, bi-annual, or annual cycles.
- Weekly memberships require `weekday` and must not include monthly scheduling fields.
- Monthly memberships require exactly one of `month_day` or `month_last_day: true`.
- Daily memberships must not include weekday or monthly scheduling fields.

Successful response (HTTP 201) contains `message` and the created `membership`.

### 6. Get membership

`GET /memberships/:id`

Requires bearer authentication. A user can only retrieve their own membership. A membership not found or not owned by the caller returns HTTP 404.

### 7. Get contribution schedule

`GET /memberships/:id/schedule`

Requires bearer authentication. Optional query parameter:
- `as_of`: date used to calculate payment statuses, e.g. `2026-11-07`. If omitted, the API uses the current Africa/Lagos date.

The response includes `membership_id`, cycle start/end, `as_of`, and the schedule/allocation result.

### 8. Record contribution inflow

`POST /webhooks/inflows`

Request:

```json
{
  "provider_ref": "PAYMENT-REFERENCE-001",
  "membership_id": "<membership-uuid>",
  "amount_kobo": 100000,
  "received_at": "2026-11-07T12:00:00+01:00"
}
```

Validation:
- `provider_ref`: non-empty string.
- `membership_id`: UUID.
- `amount_kobo`: positive safe integer in kobo.
- `received_at`: RFC3339 timestamp including timezone (`Z` or explicit offset).

Behavior:
- The `provider_ref` is the idempotency reference.
- Repeating the same reference with the same membership and amount returns the previously processed inflow.
- Reusing the reference with a different membership or amount records a data conflict and returns HTTP 409.
- Payments are allocated to expected savings up to the cycle's expected amount. Excess is held as credit.
- If savings have already been paid out, a later inflow is held as credit.

**Security note:** This route is currently public in the application code; no webhook signature or shared-secret guard is attached. Before connecting a real payment provider or accepting production money, protect it with provider signature verification or an equivalent authenticated webhook mechanism.

### 9. Request payout

`POST /memberships/:id/payout`

Requires bearer authentication and this header:

```http
Idempotency-Key: a-unique-payout-request-key
```

No request body is required.

Rules:
- The membership must belong to the authenticated user.
- The membership cycle must have ended in the Africa/Lagos timezone.
- A positive savings balance must be available.
- A membership can only be paid out once.
- Repeating the same idempotency key for the same membership returns the stored response.
- Reusing the same key for a different membership returns HTTP 409.

### 10. Trial balance

`GET /ledger/trial-balance`

Returns ledger accounts with `balance_kobo`, total debit and credit amounts, the difference, and `is_balanced`. A balanced ledger should have `is_balanced: true` and `difference_kobo: 0`.

## Money and dates

- All monetary amounts are integers in **kobo**, not naira. Example: `100000` kobo = ₦1,000.
- Schedule and payout eligibility calculations use the Africa/Lagos calendar date (UTC+1).
- Inflow `received_at` must include a timezone offset.
- Use ISO date format `YYYY-MM-DD` for `joined_on` and `as_of`.

## Common HTTP errors

| Status | Meaning / common cause |
|---|---|
| 400 | DTO validation failure, invalid membership configuration, payout not yet eligible, or no savings available |
| 401 | Missing/invalid/expired bearer token or invalid login |
| 403 | Attempt to create a membership for another user |
| 404 | User, group, or owned membership not found |
| 409 | Duplicate email, conflicting provider reference, already-paid-out membership, or idempotency key conflict |

Validation uses a global whitelist and rejects unexpected request fields.

## Postman files

- `Noble-MFB-Postman-Collection.json`
- `Noble-MFB-Postman-Environment.json`

Import both files into Postman. Select the production environment before sending requests. The collection stores the JWT after login and stores the user and membership IDs after successful registration/membership creation.

## Deployment note

The Render free web service may spin down after inactivity, so its first request after a period of inactivity may take longer. The currently provisioned free PostgreSQL database has an expiry date; arrange a persistent database before that date if the API must remain available.
