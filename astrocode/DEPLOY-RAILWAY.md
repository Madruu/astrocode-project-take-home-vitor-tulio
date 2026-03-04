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

### 2. Banco de dados PostgreSQL

1. No Railway, clique em **+ New** → **Database** → **PostgreSQL**
2. O Railway cria o banco e injeta automaticamente a variável **DATABASE_URL** no seu serviço
3. Vincule o banco ao serviço do backend (ou use a mesma variável em ambos)

O app usa `DATABASE_URL` quando disponível (Railway) e as variáveis individuais (`DB_HOST`, etc.) para desenvolvimento local.

### 3. Variáveis de ambiente

Configure no Railway (Settings → Variables):

- **PORT** – definido automaticamente pelo Railway
- **DATABASE_URL** – injetada automaticamente quando você adiciona PostgreSQL
- **JWT_SECRET** – chave para tokens JWT
- **PAYPAL_FRONTEND_URL** – URL do frontend na Vercel (ex: `https://astrocode-web.vercel.app`)
- **MP_FRONTEND_URL** – mesma URL do frontend (para Mercado Pago)

### 4. CORS

O backend aceita automaticamente `*.vercel.app`. Se usar domínio customizado ou ainda tiver erro de CORS, adicione no Railway:

- **CORS_ORIGINS** – URLs separadas por vírgula, ex: `https://seu-app.vercel.app,https://www.seudominio.com`

### 5. Redeploy

Depois de ajustar o Root Directory, faça um novo deploy (Deployments → Redeploy).
