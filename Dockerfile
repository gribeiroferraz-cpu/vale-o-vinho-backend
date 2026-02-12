# Dockerfile otimizado para Vale o Vinho Backend
# Multi-stage build para reduzir tamanho da imagem final

# Stage 1: Build
FROM node:22-alpine AS builder

# Instalar dependências do sistema necessárias
RUN apk add --no-cache python3 make g++

# Definir diretório de trabalho
WORKDIR /app

# Copiar apenas arquivos de configuração primeiro (melhor cache)
COPY package.json package-lock.json tsconfig.json ./

# Instalar TODAS as dependências (dev + prod) para o build
RUN npm ci --legacy-peer-deps

# Copiar código fonte
COPY server ./server
COPY drizzle ./drizzle
COPY shared ./shared

# Build do TypeScript com esbuild
RUN npm run build

# Stage 2: Production
FROM node:22-alpine

# Instalar apenas dependências de runtime
RUN apk add --no-cache tini

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Definir diretório de trabalho
WORKDIR /app

# Copiar package files
COPY package.json package-lock.json ./

# Instalar apenas dependências de produção
RUN npm ci --legacy-peer-deps --only=production && \
    npm cache clean --force

# Copiar arquivos buildados do stage anterior
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/drizzle ./drizzle

# Mudar para usuário não-root
USER nodejs

# Expor porta (Railway injeta a variável PORT)
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Usar tini como init system
ENTRYPOINT ["/sbin/tini", "--"]

# Comando de start
CMD ["node", "dist/index.js"]
