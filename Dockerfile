# Dockerfile otimizado para Railway com npm
# Multi-stage build para reduzir tamanho da imagem final

# Stage 1: Build
FROM node:22-alpine AS builder

# Instalar dependências do sistema necessárias
RUN apk add --no-cache python3 make g++

# Definir diretório de trabalho
WORKDIR /app

# Copiar package files
COPY package*.json ./
COPY tsconfig.json ./

# Instalar dependências com npm (usando legacy-peer-deps)
RUN npm ci --legacy-peer-deps --only=production && \
    npm ci --legacy-peer-deps

# Copiar código fonte
COPY . .

# Build do TypeScript
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
COPY package*.json ./

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

# Usar tini como init system
ENTRYPOINT ["/sbin/tini", "--"]

# Comando de start
CMD ["node", "dist/index.js"]
