# 🚀 Guia de Deploy - Railway com NPM (DEFINITIVO)

## 📋 O que foi corrigido nesta versão:

### ✅ Arquivos adicionados/modificados:

1. **nixpacks.toml** - Força o Railway a usar npm (não pnpm)
2. **railway.json** - Simplificado para deixar Nixpacks controlar o build
3. **.npmrc** - Configuração do npm com legacy-peer-deps
4. **package-lock.json** - Lockfile do npm (625 KB)
5. **.railwayignore** - Ignora arquivos desnecessários no deploy
6. **Removido:** pnpm-lock.yaml.bak (estava causando auto-detecção errada)

### 🔧 Como o Railway vai buildar agora:

```bash
# Fase Setup
nixPkgs = ['nodejs_22', 'npm-9_x']

# Fase Install
npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# Fase Build
npm run build

# Start
node dist/index.js
```

---

## 📤 PASSO A PASSO - Upload no GitHub:

### 1. Baixe e extraia o ZIP
- Arquivo: `vale-o-vinho-backend-COM-NPM-FINAL.zip`
- Extraia em uma pasta no seu Mac

### 2. Acesse o GitHub
- URL: https://github.com/gribeiroferraz-cpu/vale-o-vinho-backend
- Faça login se necessário

### 3. Delete TODOS os arquivos antigos
- Clique em cada arquivo e delete (ou use bulk delete se disponível)
- **IMPORTANTE:** Limpar tudo antes de fazer upload dos novos arquivos

### 4. Upload dos novos arquivos
- Clique em **"Add file"** → **"Upload files"**
- Arraste **TODOS** os arquivos da pasta extraída
- **Commit message:**
  ```
  fix: migração completa para npm com nixpacks config
  ```
- Clique em **"Commit changes"**

---

## 🎯 O que vai acontecer no Railway:

1. ✅ Railway detecta novo commit no GitHub
2. ✅ Lê `nixpacks.toml` e força uso de npm
3. ✅ Instala dependências com `npm ci` ou `npm install`
4. ✅ Executa `npm run build`
5. ✅ Inicia servidor com `node dist/index.js`
6. ✅ Healthcheck passa (rota `/` retorna "Vale o Vinho Backend OK")

---

## 🔍 Como verificar se funcionou:

### Logs de Build devem mostrar:
```
✅ npm ci --legacy-peer-deps
✅ npm run build
✅ Successfully built
```

### Logs de Deploy devem mostrar:
```
✅ Server running on http://0.0.0.0:XXXX
✅ Healthcheck passed
```

---

## 🆘 Se ainda der erro:

1. **Verifique as variáveis de ambiente no Railway:**
   - Remova qualquer variável `PORT` manual
   - Remova `NIXPACKS_PKGS` se existir
   - Railway injeta PORT automaticamente

2. **Force um redeploy:**
   - No Railway, vá em Deployments
   - Clique nos 3 pontos do último deploy
   - "Redeploy"

3. **Verifique os logs completos:**
   - Build Logs: deve mostrar npm (não pnpm)
   - Deploy Logs: deve mostrar "Server running"

---

## ✅ Checklist Final:

- [ ] Baixei e extraí o ZIP
- [ ] Deletei todos os arquivos antigos no GitHub
- [ ] Fiz upload de TODOS os novos arquivos
- [ ] Commit feito com sucesso
- [ ] Railway detectou o commit e iniciou build
- [ ] Build passou (sem erro de "pnpm: not found")
- [ ] Deploy passou (healthcheck OK)
- [ ] Backend respondendo em https://vale-o-vinho-backend-production-8db9.up.railway.app

---

## 🎉 Próximos passos (DEPOIS do deploy funcionar):

1. Executar migrations de assinatura: `npm run db:push`
2. Configurar webhook do Stripe
3. Testar endpoints de assinatura
4. Integrar frontend

---

**IMPORTANTE:** Esta versão tem TODAS as correções necessárias. Se ainda der erro, o problema está na configuração do Railway (variáveis de ambiente) ou no GitHub (arquivos não foram todos enviados).
