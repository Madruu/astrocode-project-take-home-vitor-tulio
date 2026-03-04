# Astrocode Project

Full-stack scheduling and wallet platform composed of:

- `astrocode/` - NestJS API (PostgreSQL, JWT auth, booking/task/payment modules)
- `astrocode-web/` - Angular frontend

This guide covers local setup, environment variables, run commands, and API usage.

## Architecture

- **Backend:** NestJS + TypeORM + PostgreSQL
- **Frontend:** Angular 21
- **Auth:** JWT bearer token (`Authorization: Bearer <token>`)
- **Payments:** wallet deposits + PayPal checkout/confirmation flow

## Prerequisites

- Node.js 20+ (recommended)
- npm 10+ (or compatible)
- PostgreSQL 14+ running locally (default port `5432`)

## Repository Structure

```text
astrocode-project/
  astrocode/      # Backend API
  astrocode-web/  # Frontend app
```

## 1) Backend Setup (`astrocode`)

### Install dependencies

```bash
cd astrocode
npm install
```

### Configure environment

Create `.env` from the sample:

```bash
copy .env.example .env
```

Then edit `.env` with your values.

### Required backend environment variables

| Variable | Required | Default/fallback in code | Description |
| --- | --- | --- | --- |
| `PORT` | No | `3000` | API server port |
| `DB_HOST` | Yes | `localhost` | PostgreSQL host |
| `DB_PORT` | Yes | `5432` | PostgreSQL port |
| `DB_USERNAME` | Yes | `postgres` | DB user |
| `DB_PASSWORD` | Yes | none (set explicitly) | DB password |
| `DB_DATABASE` | Yes | `astrocode` | Database name |
| `JWT_SECRET` | Strongly recommended | `dev-secret` | JWT signing secret |

### PayPal variables (for PayPal deposit flow)

| Variable | Required for PayPal | Description |
| --- | --- | --- |
| `PAYPAL_CLIENT_ID` | Yes | PayPal REST app client ID |
| `PAYPAL_CLIENT_SECRET` | Yes | PayPal REST app secret |
| `PAYPAL_MODE` | No | `sandbox` or `live` (defaults to sandbox behavior) |
| `PAYPAL_FRONTEND_URL` | Recommended | Frontend callback URL, e.g. `http://localhost:4200/account` |
| `PAYPAL_NOTIFICATION_URL` | Optional | Public webhook URL for PayPal notifications |
| `PAYPAL_WEBHOOK_ID` | Optional | Enables webhook signature verification when set |

### Run backend

```bash
# dev (watch)
npm run start:dev

# prod build + run
npm run build
npm run start:prod
```

Backend default URL: `http://localhost:3000`

## 2) Frontend Setup (`astrocode-web`)

### Install dependencies

```bash
cd astrocode-web
npm install
```

### Configure API base URL

Default frontend API base URL is:

- `http://localhost:3000`

This is defined in `src/app/core/config/api.config.ts`.  
If needed, you can override it at runtime by setting:

- `globalThis.__ASTROCODE_API_BASE_URL__`

### Run frontend

```bash
npm start
```

Frontend default URL: `http://localhost:4200`

## 3) Running both apps

Use two terminals:

```bash
# terminal 1
cd astrocode
npm run start:dev
```

```bash
# terminal 2
cd astrocode-web
npm start
```

## Authentication Flow

1. Create user: `POST /user`
2. Sign in: `POST /auth/signin`
3. Store returned token
4. Send token in `Authorization: Bearer <token>` header for protected routes

Token expires in `1d` by default.

## API Documentation

Base URL: `http://localhost:3000`

### Swagger (OpenAPI)

Interactive API documentation is available via Swagger UI when the backend is running:

- **URL:** `http://localhost:3000/api/docs`

The Swagger UI provides:

- Browse all endpoints (Auth, Users, Tasks, Bookings, Payments)
- Try out requests directly from the browser
- Bearer auth support: use **Authorize** to add your JWT token for protected routes
- Request/response schemas and validation rules

### Health

- `GET /` - basic app response

### Auth

- `POST /auth/signin` - login with `email` and `password`
- `POST /auth/signout` - invalidate current session (JWT required)

**Sign-in request**

```json
{
  "email": "user@email.com",
  "password": "YourPassword123"
}
```

**Sign-in response**

```json
{
  "userId": 1,
  "user": "John",
  "email": "user@email.com",
  "token": "<jwt>",
  "accountType": "USER"
}
```

### Users

- `POST /user` - create user (public)
- `GET /user` - list users (JWT required)
- `GET /user/:id` - get user by id (JWT required)
- `PUT /user/:id` - update user (JWT required)

**Create user request**

```json
{
  "name": "John",
  "email": "user@email.com",
  "password": "YourPassword123",
  "confirmPassword": "YourPassword123",
  "accountType": "USER",
  "cnpj": "optional-for-provider"
}
```

`accountType` accepted values: `USER`, `PROVIDER`.

### Tasks

- `POST /task` - create task (provider JWT)
- `GET /task` - list tasks (JWT required)
- `PUT /task/:id` - update task (provider JWT)
- `DELETE /task/:id` - delete task (provider JWT)

**Task payload**

```json
{
  "title": "Corte de cabelo",
  "description": "Corte masculino com tesoura",
  "price": 45
}
```

### Bookings

- `POST /booking/create` - create booking (JWT required)
- `GET /booking/list` - list bookings for current user/provider (JWT required)
- `POST /booking/cancel` - cancel booking (JWT required)

**Create booking payload**

```json
{
  "taskId": 2,
  "userId": 1,
  "scheduledDate": "2026-03-03T14:00:00.000Z",
  "paymentMethod": "wallet"
}
```

`paymentMethod` values: `wallet`, `direct`.

### Payments / Wallet

- `POST /payment/create` - direct deposit to wallet (JWT required)
- `GET /payment/list` - list wallet transactions (JWT required)
- `GET /payment/wallet` - wallet summary (JWT required)
- `POST /payment/purchase-task` - purchase task from balance (JWT required)

**Create deposit payload**

```json
{
  "amount": 100,
  "currency": "BRL",
  "reference": "optional-ref",
  "description": "optional-description"
}
```

### PayPal Deposits

- `POST /payment/paypal/checkout` - create PayPal order and return checkout URL (JWT required)
- `POST /payment/paypal/confirm` - capture approved order and credit wallet (JWT required)
- `POST /payment/paypal/webhook` - PayPal webhook endpoint

**Checkout payload**

```json
{
  "amount": 50,
  "currency": "BRL"
}
```

**Checkout response**

```json
{
  "checkoutUrl": "https://www.sandbox.paypal.com/checkoutnow?token=...",
  "orderId": "...",
  "paymentReference": "wallet_deposit:<paymentId>:user:<userId>"
}
```

**Confirm payload**

```json
{
  "orderId": "PAYPAL_ORDER_ID",
  "externalReference": "wallet_deposit:123:user:1"
}
```

## Quick curl examples

### 1. Register

```bash
curl -X POST http://localhost:3000/user ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"John\",\"email\":\"john@example.com\",\"password\":\"123456\",\"confirmPassword\":\"123456\",\"accountType\":\"USER\"}"
```

### 2. Login

```bash
curl -X POST http://localhost:3000/auth/signin ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"john@example.com\",\"password\":\"123456\"}"
```

### 3. Wallet summary (replace `<TOKEN>`)

```bash
curl http://localhost:3000/payment/wallet ^
  -H "Authorization: Bearer <TOKEN>"
```

## Important Notes

- TypeORM is using `synchronize: true` in development; avoid this in production.
- CORS allows `http://localhost:4200`, `http://127.0.0.1:4200`, and configured frontend URLs.
- The frontend automatically sends JWT via HTTP interceptor when user is authenticated.

## Available npm scripts

### Backend (`astrocode`)

- `npm run start:dev` - start API in watch mode
- `npm run build` - build backend
- `npm run start:prod` - run compiled backend
- `npm run test` - run tests

### Frontend (`astrocode-web`)

- `npm start` - run Angular dev server
- `npm run build` - build frontend
- `npm run test` - run frontend tests

