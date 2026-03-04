# Astrocode Frontend Deploy (Vercel)

This guide explains how to host the frontend online on **Vercel** to meet the requirement: *"Mandatory frontend hosting - The project must be hosted and accessible online"*.

## Prerequisites

- Account on [Vercel](https://vercel.com) (free)
- Project on [GitHub](https://github.com) (recommended for automatic deploy)

## Option 1: Deploy via GitHub (recommended)

1. **Push the project to GitHub** (if you haven't already):
   ```bash
   git add .
   git commit -m "Add Vercel deployment config"
   git push origin main
   ```

2. **Go to [vercel.com](https://vercel.com)** and log in with your GitHub account.

3. **Import the project**:
   - Click "Add New..." → "Project"
   - Select the project repository
   - **Root Directory**: set to `astrocode-web` (important!)
   - Click "Deploy"

4. **Configure the environment variable** (when the backend is online):
   - In the project panel on Vercel → Settings → Environment Variables
   - Add: `API_BASE_URL` = URL of your backend (e.g. `https://your-backend.railway.app`)

5. **Redeploy** after adding the variable to apply the changes.

## Option 2: Deploy via Vercel CLI

1. **Install the Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **In the frontend folder**:
   ```bash
   cd astrocode-web
   vercel
   ```

3. Follow the prompts (login, project name, etc.).

4. To configure the API URL:
   ```bash
   vercel env add API_BASE_URL
   ```
   Enter the backend URL when prompted.

## API URL Configuration

The frontend needs the backend URL to work (login, bookings, etc.):

- **Without variable set**: uses `http://localhost:3000` (won't work in production)
- **With `API_BASE_URL`**: uses the configured URL (e.g. `https://astrocode-api.railway.app`)

**Important**: The NestJS backend also needs to be hosted and have CORS configured to accept requests from the Vercel domain.

## Result

After deploy, you will receive a public URL, for example:
- `https://astrocode-web-xxx.vercel.app`

The frontend will be **accessible online 24/7**, meeting the mandatory hosting requirement.
