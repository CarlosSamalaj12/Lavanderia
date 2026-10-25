@echo off
REM Sistema de Lavanderia - Script de Inicio
REM Usa npm.cmd para evitar el bloqueo de npm.ps1 en PowerShell

cd /d "%~dp0"

echo.
echo ===============================================
echo    SISTEMA DE GESTION DE LAVANDERIA v1.0
echo ===============================================
echo.

REM Verificar si Node.js está instalado
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js no está instalado
    echo Descarga e instala desde: https://nodejs.org/
    pause
    exit /b 1
)

echo ✓ Node.js detectado
node --version

echo.
echo Verificando dependencias...

REM Verificar si node_modules existe
if not exist "node_modules" (
    echo.
    echo Instalando dependencias (esto puede tardar 1-2 minutos)...
    call npm.cmd install
    if errorlevel 1 (
        echo ERROR: No se pudieron instalar las dependencias
        pause
        exit /b 1
    )
)

echo ✓ Dependencias instaladas

echo.
echo ===============================================
echo.
echo Iniciando Sistema de Lavanderia...
echo.
echo URL: http://localhost:3100
echo.
echo Presiona Ctrl+C para detener el servidor
echo.
echo ===============================================
echo.

call npm.cmd start
pause
