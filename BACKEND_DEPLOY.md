# 🚀 Guia de Deploy do Backend - Vale o Vinho

## 📋 Visão Geral

O backend do Vale o Vinho é uma API Node.js com:
- **Framework**: Express + tRPC
- **Banco de Dados**: MySQL (via Drizzle ORM)
- **Runtime**: Node.js 22+
- **Build**: esbuild

---

## 🔑 Variáveis de Ambiente Necessárias

### Obrigatórias

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `DATABASE_URL` | URL de conexão MySQL | `mysql://user:pass@host:3306/dbname` |
| `NODE_ENV` | Ambiente de execução | `production` |
| `PORT` | Porta do servidor | `3000` |

### Opcionais (para funcionalidades avançadas)

| Variável | Descrição | Necessário para |
|----------|-----------|-----------------|
| `JWT_SECRET` | Segredo para cookies de sessão | Autenticação de usuários |
| `OAUTH_SERVER_URL` | URL do servidor OAuth | Login de usuários |
| `VITE_APP_ID` | ID do app no sistema Manus | Autenticação |
| `OWNER_OPEN_ID` | OpenID do dono do app | Permissões de admin |
| `BUILT_IN_FORGE_API_URL` | URL da API de geração de imagens | Upload de fotos |
| `BUILT_IN_FORGE_API_KEY` | Chave da API Forge | Upload de fotos |

---

## 🗄️ Configuração do Banco de Dados

### 1. Criar Banco MySQL

Você precisa de um banco MySQL. Opções gratuitas:

- **PlanetScale** (recomendado): https://planetscale.com
- **Railway MySQL**: Incluído no plano gratuito
- **Aiven**: https://aiven.io

### 2. Executar Migrations

Após criar o banco, execute as migrations:

```bash
# Instalar dependências
pnpm install

# Gerar e executar migrations
pnpm db:push
```

Isso criará as tabelas:
- `users` - Usuários do sistema
- `wines` - Catálogo de vinhos
- `purchase_links` - Links de onde comprar
- `recipes` - Receitas para harmonização

### 3. Popular Dados Iniciais

Os vinhos e receitas já estão no banco de desenvolvimento. Para produção, você pode:

**Opção A**: Exportar dados do banco de dev e importar em produção
```bash
# No ambiente de desenvolvimento
mysqldump -u user -p dbname wines recipes > data.sql

# No ambiente de produção
mysql -u user -p dbname < data.sql
```

**Opção B**: Usar o painel Admin do app para cadastrar manualmente

---

## 🚂 Deploy no Railway (Recomendado)

### Por que Railway?
- ✅ Plano gratuito generoso ($5/mês de crédito)
- ✅ MySQL incluído
- ✅ Deploy automático via CLI
- ✅ SSL/HTTPS automático
- ✅ Logs em tempo real

### Passo a Passo

#### 1. Instalar Railway CLI

```bash
npm install -g @railway/cli
```

#### 2. Login

```bash
railway login
```

#### 3. Criar Projeto

```bash
cd /path/to/wine_curator
railway init
```

Escolha: **"Create new project"** → Nome: `vale-o-vinho-backend`

#### 4. Adicionar MySQL

```bash
railway add mysql
```

Isso cria automaticamente a variável `DATABASE_URL`.

#### 5. Configurar Variáveis de Ambiente

```bash
railway variables set NODE_ENV=production
railway variables set PORT=3000
```

Para autenticação (opcional):
```bash
railway variables set JWT_SECRET="seu-segredo-aqui-min-32-chars"
railway variables set OAUTH_SERVER_URL="https://oauth.manus.im"
railway variables set VITE_APP_ID="seu-app-id"
railway variables set OWNER_OPEN_ID="seu-open-id"
```

#### 6. Deploy

```bash
railway up
```

#### 7. Executar Migrations

```bash
railway run pnpm db:push
```

#### 8. Obter URL Pública

```bash
railway domain
```

Isso gera uma URL como: `https://vale-o-vinho-backend.up.railway.app`

---

## 🎨 Deploy no Render

### Passo a Passo

#### 1. Criar Conta

Acesse https://render.com e crie uma conta gratuita.

#### 2. Criar Web Service

1. Clique em **"New +"** → **"Web Service"**
2. Conecte seu repositório (ou faça upload manual)
3. Configure:

| Campo | Valor |
|-------|-------|
| Name | `vale-o-vinho-backend` |
| Environment | `Node` |
| Build Command | `pnpm install && pnpm build` |
| Start Command | `pnpm start` |
| Plan | `Free` |

#### 3. Adicionar Banco de Dados

1. Clique em **"New +"** → **"PostgreSQL"** (ou use MySQL externo)
2. Copie a `DATABASE_URL`

#### 4. Configurar Variáveis de Ambiente

Na aba **"Environment"**, adicione:

```
NODE_ENV=production
PORT=3000
DATABASE_URL=mysql://...
```

#### 5. Deploy

Clique em **"Create Web Service"**. O Render fará o deploy automaticamente.

#### 6. Executar Migrations

No dashboard, vá em **"Shell"** e execute:

```bash
pnpm db:push
```

---

## 🐳 Deploy com Docker (Fly.io / Cloud Run)

### Dockerfile

Já incluído no projeto (`Dockerfile` na raiz):

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Instalar pnpm
RUN npm install -g pnpm

# Copiar arquivos de dependências
COPY package.json pnpm-lock.yaml ./

# Instalar dependências
RUN pnpm install --frozen-lockfile

# Copiar código fonte
COPY . .

# Build do backend
RUN pnpm build

# Expor porta
EXPOSE 3000

# Comando de inicialização
CMD ["pnpm", "start"]
```

### Deploy no Fly.io

```bash
# Instalar CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Criar app
fly launch --name vale-o-vinho-backend

# Adicionar MySQL
fly postgres create

# Configurar variáveis
fly secrets set NODE_ENV=production
fly secrets set DATABASE_URL="mysql://..."

# Deploy
fly deploy
```

### Deploy no Google Cloud Run

```bash
# Build da imagem
gcloud builds submit --tag gcr.io/PROJECT_ID/vale-o-vinho-backend

# Deploy
gcloud run deploy vale-o-vinho-backend \
  --image gcr.io/PROJECT_ID/vale-o-vinho-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,DATABASE_URL="mysql://..."
```

---

## ⚙️ Scripts Disponíveis

| Script | Comando | Descrição |
|--------|---------|-----------|
| Dev | `pnpm dev:server` | Servidor em modo desenvolvimento |
| Build | `pnpm build` | Compila o backend para produção |
| Start | `pnpm start` | Inicia o servidor em produção |
| Migrations | `pnpm db:push` | Executa migrations do banco |
| Test | `pnpm test` | Executa testes |

---

## 🔧 Estrutura do Backend

```
server/
├── _core/
│   ├── index.ts          # Servidor Express + tRPC
│   ├── env.ts            # Variáveis de ambiente
│   ├── errors.ts         # Tratamento de erros
│   └── imageGeneration.ts # Upload de imagens
├── db.ts                 # Queries do banco
├── routers.ts            # Rotas tRPC
└── storage.ts            # Storage de arquivos
```

---

## 🧪 Testar Backend em Produção

Após o deploy, teste os endpoints:

### 1. Health Check

```bash
curl https://seu-backend.railway.app/api/health
```

Resposta esperada:
```json
{"ok": true, "timestamp": 1234567890}
```

### 2. Listar Vinhos

```bash
curl https://seu-backend.railway.app/api/trpc/wines.list
```

### 3. Testar CORS

```bash
curl -H "Origin: https://vale-o-vinho-site.vercel.app" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     https://seu-backend.railway.app/api/health
```

Deve retornar headers:
```
Access-Control-Allow-Origin: https://vale-o-vinho-site.vercel.app
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Credentials: true
```

---

## 🔄 Atualizar Frontend para Usar Backend em Produção

### 1. Atualizar Variável de Ambiente no Vercel

1. Acesse https://vercel.com/dashboard
2. Selecione o projeto `vale-o-vinho-site`
3. Vá em **Settings** → **Environment Variables**
4. Adicione/edite:

```
EXPO_PUBLIC_API_BASE_URL=https://seu-backend.railway.app
```

### 2. Redeploy

```bash
vercel --prod
```

Ou no dashboard: **Deployments** → **Redeploy**

---

## 📊 Monitoramento

### Railway

- **Logs**: `railway logs`
- **Métricas**: Dashboard do Railway
- **Alertas**: Configure no painel

### Render

- **Logs**: Aba "Logs" no dashboard
- **Métricas**: Aba "Metrics"

---

## 🐛 Troubleshooting

### Erro: "Cannot connect to database"

**Solução**: Verifique se `DATABASE_URL` está configurada corretamente:

```bash
railway variables get DATABASE_URL
```

### Erro: "CORS blocked"

**Solução**: O CORS já está configurado para aceitar qualquer origin. Verifique se o backend está respondendo:

```bash
curl -I https://seu-backend.railway.app/api/health
```

### Erro: "Module not found"

**Solução**: Certifique-se de que o build foi executado:

```bash
pnpm build
```

### Migrations não executam

**Solução**: Execute manualmente:

```bash
railway run pnpm db:push
```

---

## 💰 Custos Estimados

### Railway (Recomendado)

- **Plano Gratuito**: $5/mês de crédito
- **Uso típico**: ~$3-4/mês (backend + MySQL)
- **Upgrade**: $5/mês para $10 de crédito

### Render

- **Plano Gratuito**: Limitado (sleep após inatividade)
- **Starter**: $7/mês (sem sleep)

### Fly.io

- **Plano Gratuito**: 3 VMs pequenas
- **Uso típico**: Grátis para projetos pequenos

---

## ✅ Checklist de Deploy

- [ ] Banco de dados MySQL criado
- [ ] Variáveis de ambiente configuradas
- [ ] Migrations executadas (`pnpm db:push`)
- [ ] Backend deployado e acessível
- [ ] Health check respondendo (`/api/health`)
- [ ] CORS funcionando (teste com curl)
- [ ] Frontend atualizado com nova URL
- [ ] Teste completo: login, listar vinhos, filtros
- [ ] Dados iniciais populados (vinhos e receitas)

---

## 📞 Próximos Passos

Após o deploy bem-sucedido:

1. **Configure domínio personalizado** (opcional)
2. **Ative monitoramento** (Sentry, LogRocket)
3. **Configure backups automáticos** do banco
4. **Implemente rate limiting** para proteger a API
5. **Configure CI/CD** para deploys automáticos

---

**🎉 Pronto! Seu backend está em produção!**
