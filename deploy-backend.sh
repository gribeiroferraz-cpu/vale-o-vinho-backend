#!/bin/bash

# 🚀 Script de Deploy do Backend - Vale o Vinho
# Plataforma: Railway

set -e  # Exit on error

echo "🍷 Vale o Vinho - Deploy do Backend"
echo "===================================="
echo ""

# Verificar se Railway CLI está instalado
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI não encontrado!"
    echo ""
    echo "Instale com:"
    echo "  npm install -g @railway/cli"
    echo ""
    exit 1
fi

# Verificar se está logado
if ! railway whoami &> /dev/null; then
    echo "❌ Você não está logado no Railway!"
    echo ""
    echo "Faça login com:"
    echo "  railway login"
    echo ""
    exit 1
fi

echo "✅ Railway CLI detectado"
echo ""

# Perguntar se quer criar novo projeto ou usar existente
echo "Você quer:"
echo "  1) Criar novo projeto Railway"
echo "  2) Fazer deploy em projeto existente"
echo ""
read -p "Escolha (1 ou 2): " choice

if [ "$choice" == "1" ]; then
    echo ""
    echo "📦 Criando novo projeto..."
    railway init
    
    echo ""
    echo "🗄️  Adicionando MySQL..."
    railway add mysql
    
    echo ""
    echo "⚙️  Configurando variáveis de ambiente..."
    railway variables set NODE_ENV=production
    railway variables set PORT=3000
    
    echo ""
    echo "✅ Projeto criado!"
fi

echo ""
echo "🚀 Fazendo deploy..."
railway up

echo ""
echo "🗄️  Executando migrations..."
railway run pnpm db:push

echo ""
echo "✅ Deploy concluído!"
echo ""
echo "📋 Próximos passos:"
echo ""
echo "1. Obter URL pública:"
echo "   railway domain"
echo ""
echo "2. Ver logs:"
echo "   railway logs"
echo ""
echo "3. Testar health check:"
echo "   curl https://sua-url.railway.app/api/health"
echo ""
echo "4. Atualizar frontend (Vercel):"
echo "   EXPO_PUBLIC_API_BASE_URL=https://sua-url.railway.app"
echo ""
