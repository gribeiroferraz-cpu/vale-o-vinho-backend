# 🐳 Guia de Deploy - Vale o Vinho Backend (Dockerfile + npm)

## 📋 Visão Geral

Este guia documenta o deploy do backend usando **Dockerfile** com **npm** no Railway.

Após múltiplas tentativas com Nixpacks, optamos por usar Dockerfile para garantir controle total sobre o processo de build.

---

## ✅ Arquivos Incluídos

### **Dockerfile** (Multi-stage build otimizado)
- **Stage 1 (Builder):** Compila TypeScript com todas as dependências
- **Stage 2 (Production):** Imagem final enxuta apenas com runtime
- Usa Node.js 22 Alpine (imagem leve)
- Instala dependências com `npm ci --legacy-peer-deps`
- Roda como usuário não-root (segurança)
- Usa tini como init system (gerenciamento de processos)

### **.dockerignore**
- Exclui node_modules, dist, e arquivos desnecessários
- Reduz tamanho do contexto de build
- Acelera o processo de build

### **package-lock.json**
- Lockfile do npm (625 KB)
- Garante builds reproduzíveis

### **.npmrc**
- Configuração npm com `legacy-peer-deps=true`

### **railway.json**
- Configuração do Railway (healthcheck, restart policy)

---

## 🚀 Instruções de Deploy

### **PASSO 1: Limpar GitHub**

1. Acesse: https://github.com/gribeiroferraz-cpu/vale-o-vinho-backend
2. Delete TODOS os arquivos antigos (se houver)

### **PASSO 2: Upload dos Arquivos**

1. Baixe e extraia: `vale-o-vinho-backend-COM-DOCKERFILE-NPM.zip`
2. No GitHub, clique em "Add file" → "Upload files"
3. Arraste TODOS os arquivos da pasta extraída
4. Commit message:
   ```
   feat: add optimized dockerfile with npm
   ```
5. **Commit changes**

### **PASSO 3: Configurar Railway**

1. Acesse o serviço no Railway
2. Vá em **Settings** → **Build**
3. **Builder:** Deve detectar "Dockerfile" automaticamente
4. **Dockerfile Path:** Deixe como `Dockerfile` (ou vazio)
5. Salve

### **PASSO 4: Deploy**

O Railway vai automaticamente:
1. ✅ Detectar o Dockerfile
2. ✅ Executar multi-stage build
3. ✅ Stage 1: `npm ci --legacy-peer-deps` + `npm run build`
4. ✅ Stage 2: Copiar dist/ e instalar deps de produção
5. ✅ Iniciar com `node dist/index.js`
6. ✅ Deploy com sucesso!

---

## 📊 Logs Esperados

**Build Logs devem mostrar:**

```
Step 1/X : FROM node:22-alpine AS builder
Step 2/X : WORKDIR /app
Step 3/X : COPY package*.json ./
Step 4/X : RUN npm ci --legacy-peer-deps
✅ added XXX packages
Step 5/X : COPY . .
Step 6/X : RUN npm run build
✅ Build completed successfully
Step 7/X : FROM node:22-alpine
Step 8/X : COPY --from=builder /app/dist ./dist
✅ Successfully built
✅ Successfully tagged
```

**Deploy Logs devem mostrar:**

```
✅ Starting deployment
✅ Server running on http://0.0.0.0:3000
✅ Database connected
✅ Deployment successful
```

---

## 🔧 Variáveis de Ambiente Necessárias

No Railway → Variables, configure:

```bash
# Database
MYSQL_URL=mysql://root:SENHA@HOST:PORT/railway

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Auth
JWT_SECRET=seu_jwt_secret_aqui
OAUTH_SERVER_URL=sua_url_oauth

# Node
NODE_ENV=production
```

---

## 🎯 Vantagens do Dockerfile

### **Controle Total**
- Sabemos exatamente o que está sendo executado
- Sem surpresas de auto-detecção

### **Multi-stage Build**
- Imagem final menor (~150MB vs ~500MB)
- Mais rápido para deploy

### **Segurança**
- Roda como usuário não-root
- Apenas dependências de produção na imagem final

### **Reproduzibilidade**
- Mesmo comportamento em dev, staging e prod
- Lockfile garante versões fixas

---

## 🐛 Troubleshooting

### **Erro: "npm ci" falha**
- Verifique se package-lock.json está no repositório
- Verifique se .npmrc está configurado

### **Erro: "Cannot find module"**
- Verifique se dist/ foi copiado corretamente
- Verifique se o build completou com sucesso

### **Erro: "Port already in use"**
- Railway injeta a variável PORT automaticamente
- Não precisa configurar manualmente

### **Erro: "Database connection failed"**
- Verifique se MYSQL_URL está configurado
- Verifique se o MySQL está rodando

---

## 📦 Estrutura do Repositório

```
vale-o-vinho-backend/
├── server/              # Código fonte
│   ├── _core/          # Core do backend
│   ├── routes/         # Rotas da API
│   └── middleware/     # Middlewares
├── drizzle/            # Migrations do banco
├── shared/             # Código compartilhado
├── Dockerfile          # ⭐ Build instructions
├── .dockerignore       # Arquivos a ignorar no build
├── package.json        # Dependências
├── package-lock.json   # Lockfile do npm
├── .npmrc              # Config npm
├── railway.json        # Config Railway
└── tsconfig.json       # Config TypeScript
```

---

## ✅ Checklist Final

Antes de fazer deploy, verifique:

- [ ] Dockerfile está no repositório
- [ ] .dockerignore está no repositório
- [ ] package-lock.json está no repositório
- [ ] Todas as variáveis de ambiente estão configuradas
- [ ] Railway está configurado para usar Dockerfile
- [ ] Commit foi feito com sucesso no GitHub

---

## 🎉 Após Deploy Bem-Sucedido

1. **Obter URL pública:**
   - Settings → Networking → Generate Domain

2. **Testar endpoints:**
   ```bash
   curl https://sua-url.up.railway.app/api/health
   # Deve retornar: "Vale o Vinho Backend OK"
   ```

3. **Atualizar frontend:**
   - No Vercel, atualize `EXPO_PUBLIC_API_BASE_URL`

4. **Testar sistema de assinaturas:**
   - Criar assinatura
   - Webhook do Stripe
   - Renovação automática

---

## 📞 Suporte

Se encontrar problemas:
1. Verifique os logs de build no Railway
2. Verifique os logs de deploy no Railway
3. Consulte o HISTORICO_COMPLETO_VALE_O_VINHO.md

---

**Boa sorte com o deploy! 🚀**
