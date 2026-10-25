#!/bin/bash

# Sistema de Lavanderia - Script de Inicio (Mac/Linux)

cd "$(dirname "$0")"

echo ""
echo "==============================================="
echo "    SISTEMA DE GESTION DE LAVANDERIA v1.0"
echo "==============================================="
echo ""

# Verificar si Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js no está instalado"
    echo "Descarga e instala desde: https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js detectado"
node --version

echo ""
echo "Verificando dependencias..."

# Verificar si node_modules existe
if [ ! -d "node_modules" ]; then
    echo ""
    echo "Instalando dependencias (esto puede tardar 1-2 minutos)..."
    npm install
    if [ $? -ne 0 ]; then
        echo "ERROR: No se pudieron instalar las dependencias"
        exit 1
    fi
fi

echo "✓ Dependencias instaladas"

echo ""
echo "==============================================="
echo ""
echo "🚀 Iniciando Sistema de Lavanderia..."
echo ""
echo "URL: http://localhost:3100"
echo ""
echo "Presiona Ctrl+C para detener el servidor"
echo ""
echo "==============================================="
echo ""

npm start
