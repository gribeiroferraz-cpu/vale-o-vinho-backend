# 🚂 Railway Healthcheck Fix - Vale o Vinho Backend

## 🔴 Problema Identificado

O Railway está falhando no healthcheck com "train has not arrived at the station" porque:

1. **Falta rota raiz (`/`)**: O código atual só tem `/api/health`, mas o Railway por padrão checa `/`
2. **`findAvailablePort()` não funciona no Railway**: Railway injeta uma porta específica via `PORT` env var, e tentar "procurar" outra porta quebra o healthcheck
3. **Falta bind em `0.0.0.0`**: O Railway precisa que o servidor escute em todas as interfaces
4. **Variável `PORT=3000` manual**: Deve ser removida, o Railway injeta automaticamente

---

## ✅ Solução Completa

### 1. Código Corrigido (`server/_core/index.ts`)

```typescript
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // ✅ ROOT ROUTE (Railway healthcheck padrão)
  app.get("/", (_req, res) => {
    res.status(200).send("Vale o Vinho Backend OK");
  });

  // ✅ HEALTH ROUTE (alternativa)
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  registerOAuthRoutes(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // ✅ USA A PORTA DO RAILWAY (não procura outra)
  const port = parseInt(process.env.PORT || "3000");

  // ✅ BIND EM 0.0.0.0 (Railway precisa disso)
  server.listen(port, "0.0.0.0", () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
```

**Principais mudanças:**
- ❌ Removido `isPortAvailable()` e `findAvailablePort()` (não funciona no Railway)
- ✅ Adicionado rota raiz `GET /` retornando texto simples
- ✅ Bind em `0.0.0.0` no `server.listen()`
- ✅ Usa diretamente `process.env.PORT` sem tentar "procurar" outra porta

---

### 2. Configuração no Railway Dashboard

#### A) Remover variável PORT manual
1. Acesse Railway Dashboard → `noble-reverence` → `production`
2. Vá em **Variables**
3. **DELETE** a variável `PORT=3000` (Railway injeta automaticamente)
4. Mantenha apenas:
   - `JWT_SECRET` (existente)
   - `NODE_ENV=production`
   - `OAUTH_SERVER_URL=https://oauth.manus.im`

#### B) Configurar Start Command
1. Vá em **Settings** → **Deploy**
2. **Start Command**: `node dist/index.js`
3. **Build Command**: `npm run build` (ou deixe vazio se já está configurado)

#### C) Configurar Healthcheck Path (opcional mas recomendado)
1. Vá em **Settings** → **Healthcheck**
2. **Healthcheck Path**: `/` (ou `/api/health`)
3. **Healthcheck Timeout**: 300 segundos
4. Salve

#### D) Expor serviço publicamente
1. Vá em **Settings** → **Networking**
2. Certifique-se de que **Public Networking** está habilitado
3. Anote o domínio público (ex: `vale-o-vinho-backend-production.up.railway.app`)

---

### 3. Checklist de Deploy

```bash
# ✅ 1. Atualizar código local
cd ~/Desktop/vale-o-vinho-backend

# ✅ 2. Substituir server/_core/index.ts pelo código corrigido acima

# ✅ 3. Testar localmente (simular Railway)
PORT=8080 NODE_ENV=production OAUTH_SERVER_URL=https://oauth.manus.im node dist/index.js

# ✅ 4. Testar rotas localmente
curl http://localhost:8080/
# Deve retornar: "Vale o Vinho Backend OK"

curl http://localhost:8080/api/health
# Deve retornar: {"ok":true,"timestamp":...}

# ✅ 5. Commit e push
git add server/_core/index.ts
git commit -m "fix: Railway healthcheck - add root route and bind 0.0.0.0"
git push origin main

# ✅ 6. No Railway Dashboard:
# - Remover variável PORT=3000
# - Configurar Start Command: node dist/index.js
# - Configurar Healthcheck Path: /
# - Trigger manual redeploy (ou aguardar auto-deploy)

# ✅ 7. Aguardar deploy (~2-5 minutos)

# ✅ 8. Testar domínio público
curl https://vale-o-vinho-backend-production.up.railway.app/
# Deve retornar: "Vale o Vinho Backend OK"

curl https://vale-o-vinho-backend-production.up.railway.app/api/health
# Deve retornar: {"ok":true,"timestamp":...}
```

---

### 4. Troubleshooting

#### Se ainda falhar no healthcheck:

**A) Verificar logs do Railway**
```bash
railway logs --service vale-o-vinho-backend
```

Procure por:
- `[api] server listening on port XXXX` ✅
- Erros de `EADDRINUSE` ❌
- Erros de `server is not defined` ❌

**B) Verificar se a porta está correta**
O Railway injeta `PORT` automaticamente (geralmente 3000-8000). Se o log mostrar porta diferente de 3000, está OK.

**C) Verificar se o domínio está provisionado**
- Acesse Railway Dashboard → Networking
- Se aparecer "Malformed Domain" ou "Unexposed service", clique em **Generate Domain** novamente

**D) Forçar rebuild limpo**
```bash
# No Railway Dashboard:
# Settings → Delete Service Cache
# Depois: Deployments → Redeploy
```

---

### 5. Após Deploy Bem-Sucedido

#### Atualizar frontend na Vercel:
1. Acesse Vercel Dashboard → `vale-o-vinho-site`
2. Settings → Environment Variables
3. Edite `EXPO_PUBLIC_API_BASE_URL`:
   ```
   https://vale-o-vinho-backend-production.up.railway.app
   ```
4. Deployments → Redeploy

#### Testar integração completa:
1. Acesse https://vale-o-vinho-site.vercel.app
2. Abra DevTools → Console
3. Não deve haver erros de CORS ou network
4. Os vinhos devem carregar normalmente

---

## 📋 Resumo das Mudanças

| Item | Antes | Depois |
|------|-------|--------|
| Rota raiz `/` | ❌ Não existia | ✅ Retorna "Vale o Vinho Backend OK" |
| Porta | ❌ `findAvailablePort()` | ✅ `process.env.PORT` direto |
| Bind | ❌ Sem especificar | ✅ `0.0.0.0` |
| Variável PORT | ❌ Manual `PORT=3000` | ✅ Removida (Railway injeta) |
| Healthcheck Path | ❌ Não configurado | ✅ `/` |

---

## 🎯 Resultado Esperado

Após aplicar todas as correções:

```
✅ Railway Deploy: Successful
✅ Healthcheck: Passing
✅ Status: Online
✅ curl https://.../ → "Vale o Vinho Backend OK"
✅ curl https://.../api/health → {"ok":true,"timestamp":...}
✅ Frontend Vercel → Sem erros CORS, vinhos carregam
```

---

**Dúvidas? Me chame!** 🚀
