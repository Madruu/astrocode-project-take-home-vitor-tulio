# Backend Deploy on Railway

## Required Configuration

The error `Cannot find module '/app/index.js'` occurs because Railway is using the project root instead of the NestJS backend folder.

### 1. Set the Root Directory

In the Railway dashboard:

1. Open your **astrocode-project** service
2. Go to **Settings**
3. Under **Build**, find **Root Directory**
4. Set it to: **`astrocode`**
5. Save

This makes Railway use the NestJS backend folder (where the correct `package.json` and `main.ts` are located).

### 2. PostgreSQL Database

1. In Railway, click **+ New** → **Database** → **PostgreSQL**
2. Railway creates the database and automatically injects the **DATABASE_URL** variable into your service
3. Link the database to your backend service (or use the same variable in both)

The app uses `DATABASE_URL` when available (Railway) and individual variables (`DB_HOST`, etc.) for local development.

### 3. Environment Variables

Configure in Railway (Settings → Variables):

- **PORT** – set automatically by Railway
- **DATABASE_URL** – injected automatically when you add PostgreSQL

#### PayPal (for payments)

| Variable | Description | Example |
|----------|-------------|---------|
| **PAYPAL_CLIENT_ID** | Client ID from your app on [PayPal Developer](https://developer.paypal.com/) | `AbRnK...` |
| **PAYPAL_CLIENT_SECRET** | Client Secret from your app | `EJDES...` |
| **PAYPAL_MODE** | `sandbox` (testing) or `live` (production) | `sandbox` |
| **PAYPAL_FRONTEND_URL** | URL of the account page on the frontend (Vercel) | `https://your-app.vercel.app/account` |
| **PAYPAL_NOTIFICATION_URL** | Webhook URL (backend) | `https://astrocode-project-production.up.railway.app/payment/paypal/webhook` |
| **PAYPAL_WEBHOOK_ID** | Webhook ID in PayPal (optional) | `5CV99958XT248525R` |
- **JWT_SECRET** – key for JWT tokens
- **PAYPAL_FRONTEND_URL** – frontend URL on Vercel (e.g. `https://astrocode-web.vercel.app`)
- **MP_FRONTEND_URL** – same frontend URL (for Mercado Pago)

### 4. CORS

The backend automatically accepts `*.vercel.app`. If using a custom domain or still getting CORS errors, add in Railway:

- **CORS_ORIGINS** – URLs separated by commas, e.g. `https://your-app.vercel.app,https://www.yourdomain.com`

### 5. Redeploy

After adjusting the Root Directory, trigger a new deploy (Deployments → Redeploy).
