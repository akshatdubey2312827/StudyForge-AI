# StudyForge AI — Backend API

Node.js + Express + MongoDB + BullMQ + Redis + Stripe + Google Gemini

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20.x |
| MongoDB | ≥ 7.x (local or Atlas) |
| Redis | ≥ 7.x (local or Upstash) |
| Stripe CLI | latest (for webhook testing) |

---

## Quick Start

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your real values (see variable reference below)
```

> [!IMPORTANT]
> **MongoDB Transaction Requirement**: StudyForge AI uses multi-document MongoDB transactions for atomic credit reservation and checkout idempotency.
> - **Local MongoDB**: Must be run as a replica set (standalone mongod does not support transactions).
>   1. Start mongod with a replica set name: `mongod --replSet rs0 --dbpath <data_dir>`
>   2. In `mongosh`, initialize the replica set once: `rs.initiate()`
> - **MongoDB Atlas (Cloud)**: Recommended alternative — free M0 clusters are 3-node replica sets out of the box. Use the standard `mongodb+srv://...` URI in `.env`.

### 3. Run the two processes in separate terminals

**Terminal 1 — API Server (port 3001)**
```bash
npm run dev
```

**Terminal 2 — BullMQ Worker**
```bash
npm run worker
```

Both processes share MongoDB and Redis but run independently. If the worker crashes, the API server stays up and vice versa. Jobs will queue in Redis until the worker recovers.

---

## Environment Variables Reference

See [`.env.example`](.env.example) for the complete list. Critical ones:

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_ACCESS_SECRET` | 64-byte hex secret for access tokens |
| `JWT_REFRESH_SECRET` | Different 64-byte hex secret for refresh tokens |
| `GOOGLE_CLIENT_ID` | Google OAuth App Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth App Client Secret |
| `GOOGLE_CALLBACK_URL` | Must match exactly what's in Google Cloud Console |
| `STRIPE_SECRET_KEY` | Stripe test/live secret key (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | From `stripe listen` or dashboard (`whsec_...`) |
| `GEMINI_API_KEY` | Google AI Studio API key |

Generate JWT secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Local Stripe Webhook Testing

The webhook is the **only** place credits are added — never trust a client redirect.

```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe login

# Forward webhooks to local server
stripe listen --forward-to http://localhost:3001/api/billing/webhook

# In another terminal, trigger a test payment
stripe trigger payment_intent.succeeded
```

Copy the webhook signing secret printed by `stripe listen` to `STRIPE_WEBHOOK_SECRET` in `.env`.

---

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Web Application)
3. Add `http://localhost:3001/api/auth/google/callback` to **Authorized Redirect URIs**
4. Copy Client ID and Secret to `.env`

---

## Production Build

```bash
npm run build          # Compiles TypeScript → dist/
node dist/server.js    # API server
node dist/worker.js    # Worker (separate process / container)
```

---

## API Reference

All endpoints return JSON. Cookies are httpOnly.

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/auth/google` | Redirect to Google OAuth |
| `GET` | `/api/auth/google/callback` | OAuth callback — sets cookies, redirects to frontend |
| `POST` | `/api/auth/refresh` | Rotate access token using refresh cookie |
| `POST` | `/api/auth/logout` | Clear cookies, revoke refresh token |
| `GET` | `/api/auth/session` | Return current user from access cookie |

### Notes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/notes/generate` | Check balance → reserve credits → enqueue job |
| `GET` | `/api/notes` | List completed notes (paginated) |
| `GET` | `/api/notes/:noteId` | Get full note with content, diagrams, questions |

Rate limit on `/generate`: **10 requests per 15 minutes** per user.

### Jobs

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/jobs/:jobId` | Poll job status — returns `pending\|processing\|complete\|failed` + `progress` + `note_id` |

### Billing

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/billing/balance` | Current credit balance + lifetime used |
| `GET` | `/api/billing/transactions` | Transaction history (paginated) |
| `POST` | `/api/billing/checkout` | Create Stripe Checkout session, returns `checkout_url` |
| `POST` | `/api/billing/webhook` | Stripe webhook (raw body) — idempotent credit granting |

---

## Architecture

```
┌──────────────────┐     ┌──────────────────┐
│   API Server     │     │   BullMQ Worker  │
│  (src/server.ts) │     │  (src/worker.ts) │
│                  │     │                  │
│  Express + Auth  │     │  Picks up jobs   │
│  Rate limiting   │     │  → Gemini API    │
│  Zod validation  │     │  → Zod validate  │
│  Credit check    │     │  → Save note     │
│  Reserve + Queue │     │  → Ledger spend  │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         ▼                        ▼
    ┌─────────┐             ┌─────────┐
    │  Redis  │◄────────────│  Redis  │
    │ (Queue) │             │ (Queue) │
    └─────────┘             └─────────┘
         │                        │
         ▼                        ▼
    ┌─────────────────────────────────┐
    │            MongoDB              │
    │  Users · CreditLedger · Notes   │
    │  Transactions · Jobs            │
    └─────────────────────────────────┘
```

### Credit Ledger Design

**Balance = `SUM(CreditLedger.delta)` for a userId — never a standalone counter.**

| Event | `delta` | `reason` |
|-------|---------|----------|
| User buys Starter Pack | `+50` | `purchase` |
| Note generation starts | `-2` | `reserve` |
| Note generation succeeds | *(reserve → `spend`)* | `spend` |
| Note generation fails | `+2` | `refund` |

The reserve entry prevents double-spending if two requests arrive simultaneously. On success it's updated to `spend`. On failure a positive `refund` entry restores the balance.

### Security Model

- **JWT access token**: 15 minutes, httpOnly cookie, path `/`
- **JWT refresh token**: 7 days, httpOnly cookie, path `/api/auth/refresh` (scoped to prevent CSRF reuse on other paths)
- **Refresh token rotation**: Each `/auth/refresh` call issues a new refresh token and invalidates the old one
- **Stripe webhook**: Signature verified with `stripe.webhooks.constructEvent()` + raw body — client redirects can never grant credits
- **Prompt injection guard**: `sanitizeTopic()` strips known injection patterns before topic reaches Gemini prompt or any downstream rendering
- **Zod validation**: All request bodies validated and coerced before hitting business logic

---

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── db.ts              # MongoDB connection
│   │   └── redis.ts           # Redis client factory
│   ├── models/
│   │   ├── User.ts
│   │   ├── CreditLedger.ts    # Append-only ledger
│   │   ├── Transaction.ts     # Stripe transactions
│   │   ├── Note.ts
│   │   └── Job.ts             # BullMQ job tracking
│   ├── schemas/
│   │   └── zod.ts             # All Zod schemas incl. GeminiNoteResponseSchema
│   ├── services/
│   │   ├── credits.ts         # Ledger operations
│   │   ├── gemini.ts          # Gemini API + sanitizer + retry
│   │   └── stripe.ts          # Stripe client + checkout
│   ├── queues/
│   │   └── noteQueue.ts       # BullMQ queue definition
│   ├── middleware/
│   │   ├── authenticate.ts    # JWT verify + cookie helpers
│   │   ├── validate.ts        # Zod middleware factory
│   │   └── rateLimiter.ts     # Per-user + global rate limits
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── notes.ts
│   │   ├── billing.ts
│   │   └── jobs.ts
│   ├── workers/
│   │   └── noteWorker.ts      # BullMQ worker logic
│   ├── app.ts                 # Express app (routes, middleware)
│   ├── server.ts              # HTTP server entry point
│   └── worker.ts              # Worker process entry point
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```
