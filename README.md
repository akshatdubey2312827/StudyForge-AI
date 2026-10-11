# StudyForge AI

> Production-grade, full-stack AI revision platform that generates high-yield exam notes, interactive diagrams, practice questions, and print-optimized PDF exports with an append-only credit ledger.

[![CI](https://github.com/placeholder-user/studyforge-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/placeholder-user/studyforge-ai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6%20%7C%206.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-≥20-green)](https://nodejs.org/)
[![BullMQ](https://img.shields.io/badge/BullMQ-5.12-red)](https://bullmq.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas%20%2F%20ReplicaSet-green)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-5%20%7C%207-red)](https://redis.io/)

---

## 📌 Overview

**StudyForge AI** helps students transform complex, dense topics into structured, high-yield exam revision materials in seconds. 

Powered by **Google Gemini** generative models and decoupled background job queues (**BullMQ** + **Redis**), StudyForge generates comprehensive study sheets complete with difficulty-scaled content, structured summaries, key concept breakdowns, interactive diagrams (flowcharts, sequence diagrams, mind maps, entity-relationship models via Mermaid.js), visual data charts (Recharts), prioritized practice questions, and high-contrast, print-optimized PDF exports.

The platform is engineered around financial-grade reliability: an **append-only credit ledger** backed by MongoDB multi-document ACID transactions, crash-resilient compensatory spend reconciliation, idempotent Stripe webhooks, and concurrency protection against race conditions.

---

## 🚀 Live Demo

- **Web Application**: `[YOUR_LIVE_DEMO_URL_HERE]` *(e.g., https://studyforge-ai.vercel.app)*
- **API Health Endpoint**: `http://localhost:3001/health`

---

## ✨ Key Features

- **Asynchronous AI Generation**: Decoupled HTTP request lifecycle from LLM generation using BullMQ queues and Redis. Front-facing requests enqueue jobs immediately, allowing clients to poll status with progress tracking.
- **Dynamic Model Fallback**: Integrates Google Gemini with configurable model selection (`GEMINI_MODEL`) and automatic fallback between models (e.g., `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`) with prompt sanitization.
- **Difficulty-Scaled Credit Pricing**: Dynamic difficulty pricing (Easy = 1 credit, Medium = 2 credits, Hard = 3 credits) enforced strictly by the backend with single-source-of-truth contract synchronization (`GET /api/notes/costs`).
- **Append-Only Credit Ledger**: User balance is strictly derived as `balance = SUM(CreditLedger.delta)`. Credit operations (reservations, spends, refunds) execute inside MongoDB multi-document ACID transactions with mutex locking to eliminate race conditions.
- **Crash Recovery & Reconciliation**: Background reconciliation worker cleans orphaned reservations and applies compensatory spend if worker generation completes after a premature refund.
- **Print-Engineered PDF Export**: Dedicated `@media print` CSS engine that handles page breaks cleanly, forces high-contrast black-on-white text, preserves colored badge fills (`-webkit-print-color-adjust: exact`), awaits full SVG diagram rendering, and isolates theme switching.
- **Interactive Visualizations**: Dynamic Mermaid diagrams (flowcharts, state diagrams, ERDs) and interactive Recharts metrics with responsive light and dark themes.
- **Stripe Billing & Idempotency**: Credit package checkout (Starter 50 cr, Pro 150 cr, Unlimited 500 cr) verified exclusively via cryptographic Stripe webhooks with deduplication against double-crediting.
- **Secure Authentication**: JWT-based authentication using `httpOnly`, `SameSite` cookies with short-lived access tokens, refresh token rotation, Google OAuth 2.0, and local dev simulation mode.

---

## 📸 Screenshots

| Dashboard (Light Mode) | Dashboard (Dark Mode) |
| :---: | :---: |
| ![Dashboard Light](docs/screenshots/dashboard-light.png) | ![Dashboard Dark](docs/screenshots/dashboard-dark.png) |

| Note View & Diagrams | Billing & Credit Packages |
| :---: | :---: |
| ![Note View](docs/screenshots/notes-light.png) | ![Billing](docs/screenshots/billing-light.png) |

---

## 🏗️ System Architecture

```text
 ┌───────────────────────┐
 │   React 19 Frontend   │
 │ (Tailwind v4, Recharts)│
 └───────────┬───────────┘
             │ HTTP / Cookies (JWT)
             ▼
 ┌───────────────────────┐         ┌────────────────────────┐
 │   Express API Server  │         │  BullMQ Queue Worker   │
 │    (src/server.ts)    │         │    (src/worker.ts)     │
 │                       │         │                        │
 │ • Zod Validation      │         │ • Consumes note jobs   │
 │ • Mutex Lock & Reserve│         │ • Google Gemini LLM    │
 │ • Enqueues Job        │         │ • Schema Validation    │
 │ • GET /api/notes/costs│         │ • Converts Reserve to  │
 └───────────┬───────────┘         │   Spend on Completion  │
             │                     └───────────┬────────────┘
             │                                 │
             │           ┌───────────┐         │
             ├──────────►│   Redis   │◄────────┤
             │           │  (Queue)  │         │
             │           └───────────┘         │
             │                                 │
             ▼                                 ▼
 ┌──────────────────────────────────────────────────────────┐
 │                      MongoDB Replica Set                 │
 │ • Users                • CreditLedger (Append-Only)      │
 │ • Notes & Diagrams     • Jobs & Transactions             │
 └──────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: [React 19](https://react.dev/) + [Vite 8](https://vitejs.dev/)
- **Routing**: [React Router DOM v7](https://reactrouter.com/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Diagrams & Charts**: [Mermaid.js v12](https://mermaid.js.org/), [Recharts v3](https://recharts.org/)
- **HTTP Client**: [Axios](https://axios-http.com/)

### Backend
- **Runtime**: [Node.js](https://nodejs.org/) (ES Modules / TypeScript with `tsx`)
- **Web Framework**: [Express 4](https://expressjs.com/) with [Helmet](https://helmetjs.github.io/) & [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit)
- **Database**: [MongoDB](https://www.mongodb.com/) with [Mongoose 8](https://mongoosejs.com/) (Multi-document ACID transactions)
- **Queue & Cache**: [BullMQ 5](https://docs.bullmq.io/) + [Redis](https://redis.io/) (via [ioredis 5](https://github.com/redis/ioredis))
- **AI Engine**: [Google Generative AI SDK](https://www.npmjs.com/package/@google/generative-ai) (`@google/generative-ai`)
- **Payments**: [Stripe Node SDK](https://stripe.com/docs/api)
- **Authentication**: [JSON Web Tokens](https://github.com/auth0/node-jsonwebtoken) (`jsonwebtoken`) in `httpOnly` secure cookies

---

## 📂 Project Structure

```text
studyforge-ai/
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI workflow (Redis 7 service, test, type-check)
├── docs/
│   └── screenshots/             # Application screenshots for documentation
├── frontend/                    # Vite + React 19 Client Application
│   ├── public/                  # Static assets & SVG icons
│   ├── src/
│   │   ├── api/                 # Axios API service clients (auth, billing, notes)
│   │   ├── assets/              # Static branding and vector images
│   │   ├── components/
│   │   │   ├── common/          # Reusable UI primitives (AppLayout, Sidebar, Button, Card, Badge)
│   │   │   └── notes/           # Note viewer, question cards, and DiagramRenderer
│   │   ├── constants/           # Shared package pricing and fallback tiers
│   │   ├── context/             # React context providers (Auth, Credit, Theme, Print)
│   │   ├── hooks/               # Custom React hooks (useAuth, useCredits, useJobStatus, useTheme)
│   │   ├── lib/                 # Utility functions (cn / clsx helper)
│   │   ├── mocks/               # Mock data fixtures and fallback handlers
│   │   ├── pages/               # Route views (Dashboard, Generator, Note, History, Billing, Login)
│   │   ├── types/               # TypeScript data models and interfaces
│   │   ├── App.tsx              # Root component & React Router configuration
│   │   ├── index.css            # Tailwind styles & print CSS (@media print)
│   │   └── main.tsx             # Application DOM entrypoint
│   ├── .env.example             # Frontend environment variables template
│   ├── package.json             # Frontend package configuration and scripts
│   ├── tsconfig.json            # TypeScript configuration
│   └── vite.config.ts           # Vite build and proxy settings
├── backend/                     # Express + BullMQ Server Application
│   ├── src/
│   │   ├── config/              # Database (Mongoose) and Redis client configurations
│   │   ├── middleware/          # Authentication, rate limiting, and request validation
│   │   ├── models/              # Mongoose schemas (User, Note, Job, CreditLedger, Transaction)
│   │   ├── queues/              # BullMQ queue definitions
│   │   ├── routes/              # Express route controllers (auth, billing, jobs, notes)
│   │   ├── schemas/             # Zod input validation schemas
│   │   ├── services/            # Core business logic (credits, gemini, stripe, reconciliation)
│   │   ├── workers/             # BullMQ background job processor (noteWorker)
│   │   ├── app.ts               # Express application middleware setup
│   │   ├── server.ts            # API server bootloader (port 3001)
│   │   └── worker.ts            # Independent worker process entrypoint
│   ├── scripts/                 # Maintenance, verification, and diagnostics scripts
│   ├── tests/                   # Permanent automated test suite (test-runner.ts)
│   ├── .env.example             # Backend environment variables template
│   ├── package.json             # Backend package configuration and scripts
│   └── tsconfig.json            # Backend TypeScript configuration
├── .gitignore                   # Root git exclusion rules (secrets, dependencies, build output)
├── LICENSE                      # MIT Open Source License
├── package.json                 # Root convenience scripts
└── README.md                    # Project documentation
```

---

## ⚙️ Environment Variables

### Frontend (`frontend/.env`)

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `VITE_API_URL` | No | `http://localhost:3001` | Base URL for the Express backend API |

### Backend (`backend/.env`)

| Variable | Required | Example / Default | Description |
| :--- | :---: | :---: | :--- |
| `PORT` | No | `3001` | Port on which the API server listens |
| `NODE_ENV` | No | `development` | Node environment (`development` \| `production` \| `test`) |
| `FRONTEND_URL` | Yes | `http://localhost:5173` | Allowed frontend URL for CORS and OAuth redirects |
| `MONGODB_URI` | Yes | `mongodb://localhost:27017/studyforge?replicaSet=rs0` | MongoDB connection string (must be a replica set for ACID transactions) |
| `REDIS_URL` | Yes | `redis://localhost:6380` | Redis connection URL for BullMQ queues |
| `REDIS_MAX_RETRIES` | No | `null` (production) / `2` (tests) | Cap Redis connection retries for fail-fast behavior during testing |
| `JWT_ACCESS_SECRET` | Yes | `64_byte_hex_string` | Secret key used to sign short-lived access JWT tokens |
| `JWT_REFRESH_SECRET` | Yes | `64_byte_hex_string` | Secret key used to sign long-lived refresh JWT tokens |
| `JWT_ACCESS_EXPIRES_IN` | No | `15m` | Lifetime of the access token |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Lifetime of the refresh token |
| `GOOGLE_CLIENT_ID` | Yes* | `your_client_id.apps.googleusercontent.com` | Google OAuth Client ID (*mock fallback available in dev) |
| `GOOGLE_CLIENT_SECRET` | Yes* | `your_google_client_secret` | Google OAuth Client Secret (*mock fallback available in dev) |
| `GOOGLE_CALLBACK_URL` | Yes | `http://localhost:3001/api/auth/google/callback` | OAuth redirect callback URI |
| `STRIPE_SECRET_KEY` | Yes* | `sk_test_...` | Stripe secret API key for billing checkout (*dev fallback available) |
| `STRIPE_WEBHOOK_SECRET` | Yes* | `whsec_...` | Stripe webhook signing secret for payment events |
| `STRIPE_PRICE_STARTER` | Yes* | `price_...` | Stripe Price ID for Starter package (50 credits) |
| `STRIPE_PRICE_PRO` | Yes* | `price_...` | Stripe Price ID for Pro package (150 credits) |
| `STRIPE_PRICE_UNLIMITED` | Yes* | `price_...` | Stripe Price ID for Unlimited package (500 credits) |
| `GEMINI_API_KEY` | Yes* | `your_gemini_api_key` | Google AI Studio API key for Gemini models |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Configurable model identifier for generative notes (with automatic fallback) |
| `GEMINI_TIMEOUT_MS` | No | `30000` | Request timeout for Gemini API calls in ms |
| `CREDITS_PER_NOTE` | No | `2` | Base credits required to generate a note (difficulty-scaled: easy = 1, medium = 2, hard = 3) |

---

## 🏃 How to Run Locally

### 1. Prerequisites
- **Node.js**: ≥ 20.x
- **Redis**: Port 6380 (or 6379 configured via `REDIS_URL`)
- **MongoDB**: Replica set enabled (Local mongod with `--replSet rs0` or free MongoDB Atlas cluster)

### 2. Installation
Clone the repository and install dependencies:

```bash
git clone https://github.com/placeholder-user/studyforge-ai.git
cd studyforge-ai

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### 3. Environment Configuration
Copy sample templates and populate keys:

```bash
# In backend/
cp backend/.env.example backend/.env

# In frontend/
cp frontend/.env.example frontend/.env
```

### 4. Running the Application

Start each service in separate terminal windows:

#### Terminal 1 — Start Redis Server
```bash
# Windows
C:\Redis5\redis-server.exe C:\Redis5\redis.windows.conf

# Linux / macOS
redis-server --port 6380
```

#### Terminal 2 — Backend API Server
```bash
cd backend
npm run dev
# Serves API on http://localhost:3001
```

#### Terminal 3 — BullMQ Worker
```bash
cd backend
npm run worker
# Listens to note generation queue and runs background reconciliation
```

#### Terminal 4 — Frontend Client
```bash
cd frontend
npm run dev
# Serves UI on http://localhost:5173
```

*(Alternatively, run `npm run dev:frontend`, `npm run dev:backend`, and `npm run dev:worker` from the repository root).*

---

## 🧪 Testing & Verification

The test suite (`backend/tests/test-runner.ts`) tests critical business logic and race conditions:

- **Concurrent Credit Reservation Race Conditions**: Mutex lock safety under simultaneous requests (e.g., 2 concurrent Hard requests with 3 credits available → exactly 1 succeeds).
- **Stripe Webhook Idempotency**: Deduplication prevents duplicate credit allocations on webhook retries.
- **Difficulty Cost Table Contract**: Verifies `GET /api/notes/costs` matches frontend fallback map (`{ easy: 1, medium: 2, hard: 3 }`).
- **Client Fake-Cost Tamper Proof**: Client-supplied costs (e.g. `cost: 0`) are ignored; server enforces difficulty pricing.
- **Boundary Checks**: Balance 2 + Hard = `402 Payment Required` (0 rows created); Balance 3 + Hard = success and exact balance 0.
- **Dynamic Failure Refund**: Forced worker failures refund dynamic amount based on the reservation (`+3` for Hard notes).
- **Compensatory Spend**: Ensures correct net charge when a worker finishes after a premature reconciler refund.
- **Fail-Fast Redis Check**: Fails fast in ~1.5s with a clear error message when Redis is unreachable.

### Running the Test Suite
```bash
cd backend
npm test
```

### Type-Check & Build
```bash
# Backend build
cd backend && npm run build && cd ..

# Frontend build
cd frontend && npm run build && cd ..
```

---

## 👤 Author

**Akshat Dubey**
- GitHub: [@placeholder-user](https://github.com/placeholder-user)
- LinkedIn: `[YOUR_LINKEDIN_URL_HERE]`

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
