# Deploy do Backend no Railway

## Configuração obrigatória

O erro `Cannot find module '/app/index.js'` ocorre porque o Railway está usando a raiz do projeto em vez da pasta do backend NestJS.

### 1. Defina o Root Directory

No painel do Railway:

1. Abra o seu serviço **astrocode-project**
2. Vá em **Settings**
3. Em **Build**, encontre **Root Directory**
4. Defina como: **`astrocode`**
5. Salve

Isso faz o Railway usar a pasta do backend NestJS (onde está o `package.json` correto e o `main.ts`).

### 2. Variáveis de ambiente

Configure no Railway (Settings → Variables):

- **PORT** – definido automaticamente pelo Railway
- **DATABASE_URL** – URL do PostgreSQL (se usar banco)
- **JWT_SECRET** – chave para tokens JWT
- **PAYPAL_FRONTEND_URL** – URL do frontend na Vercel (ex: `https://astrocode-web.vercel.app`)
- **MP_FRONTEND_URL** – mesma URL do frontend (para Mercado Pago)

### 3. CORS

O `main.ts` já aceita origens via `PAYPAL_FRONTEND_URL` e `MP_FRONTEND_URL`. Adicione a URL do frontend na Vercel nessas variáveis para o CORS funcionar.

### 4. Redeploy

Depois de ajustar o Root Directory, faça um novo deploy (Deployments → Redeploy).
