# Vale o Vinho - Backend Dockerfile
# Build optimizado para produção

FROM node:22-alpine AS base

# Instalar pnpm
RUN npm install -g pnpm@latest

WORKDIR /app

# ===== STAGE 1: Dependencies =====
FROM base AS dependencies

# Copiar arquivos de dependências
COPY package.json pnpm-lock.yaml ./

# Instalar dependências de produção
RUN pnpm install --frozen-lockfile --prod

# ===== STAGE 2: Build =====
FROM base AS build

# Copiar arquivos de dependências
COPY package.json pnpm-lock.yaml ./

# Instalar todas as dependências (incluindo dev)
RUN pnpm install --frozen-lockfile

# Copiar código fonte
COPY . .

# Build do backend
RUN pnpm build

# ===== STAGE 3: Production =====
FROM base AS production

# Copiar dependências de produção
COPY --from=dependencies /app/node_modules ./node_modules

# Copiar build
COPY --from=build /app/dist ./dist

# Copiar arquivos necessários
COPY package.json ./
COPY drizzle ./drizzle
COPY server ./server
COPY shared ./shared

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Mudar ownership
RUN chown -R nodejs:nodejs /app

# Usar usuário não-root
USER nodejs

# Expor porta
EXPOSE 3000

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando de inicialização
CMD ["pnpm", "start"]
