@echo off
echo ============================================================
echo  SafeView EPI Desktop --- Setup Automatico
echo ============================================================
echo.

echo Verificando Node.js...
where node >nul 2>nul
if errorlevel 1 goto ERRO_NODE
echo [OK] Node.js encontrado.
goto CHECK_GIT

:ERRO_NODE
echo.
echo [ERRO] Node.js NAO encontrado!
echo        Instale em: https://nodejs.org (versao 20 LTS)
echo        Marque "Add to PATH" durante a instalacao.
echo.
pause
exit /b 1

:CHECK_GIT
echo Verificando Git...
where git >nul 2>nul
if errorlevel 1 goto ERRO_GIT
echo [OK] Git encontrado.
goto CHECK_PYTHON

:ERRO_GIT
echo.
echo [ERRO] Git NAO encontrado!
echo        Instale em: https://git-scm.com
echo.
pause
exit /b 1

:CHECK_PYTHON
echo Verificando Python...
where python >nul 2>nul
if errorlevel 1 goto ERRO_PYTHON
echo [OK] Python encontrado.
goto START_CLONE

:ERRO_PYTHON
echo.
echo [ERRO] Python NAO encontrado!
echo        Instale em: https://www.python.org/downloads/
echo        IMPORTANTE: marque "Add Python to PATH" na instalacao.
echo.
pause
exit /b 1

:START_CLONE
if not exist "apps" mkdir apps

if exist "apps\safeview" goto SKIP_SAFEVIEW
echo.
echo [1/6] Clonando SafeView EPI...
git clone https://github.com/gabrielbarbosa04060208-ship-it/safeview40.git apps\safeview
if errorlevel 1 goto ERRO_CLONE_SAFEVIEW
echo [OK] SafeView clonado.
goto CLONE_DASHBOARD

:ERRO_CLONE_SAFEVIEW
echo [ERRO] Falha ao clonar SafeView. Verifique internet e URL.
pause
exit /b 1

:SKIP_SAFEVIEW
echo [OK] SafeView ja existe.

:CLONE_DASHBOARD
if exist "apps\dashboard" goto SKIP_DASHBOARD
echo.
echo [2/6] Clonando Dashboard EPI...
git clone https://github.com/gabrielbarbosa04060208-ship-it/dashboardsafeview.git apps\dashboard
if errorlevel 1 goto ERRO_CLONE_DASH
echo [OK] Dashboard clonado.
goto COPY_ICONS

:ERRO_CLONE_DASH
echo [ERRO] Falha ao clonar Dashboard. Verifique internet e URL.
pause
exit /b 1

:SKIP_DASHBOARD
echo [OK] Dashboard ja existe.

:COPY_ICONS
echo.
echo [3/6] Copiando icones...
if not exist "electron" mkdir "electron"
if not exist "assets\icon.ico" goto SKIP_ICONS
copy /Y "assets\icon.ico" "electron\icon.ico" >nul
copy /Y "assets\icon.png" "electron\icon.png" >nul
echo [OK] Icones copiados.
goto PATCH_SAFEVIEW

:SKIP_ICONS
echo [AVISO] Pasta assets\ nao encontrada - icone padrao sera usado.

:PATCH_SAFEVIEW
echo.
echo [4/6] Aplicando patches no SafeView EPI...
if not exist "apps\safeview\src\integrations\supabase" mkdir "apps\safeview\src\integrations\supabase"
if not exist "apps\safeview\src\hooks"                 mkdir "apps\safeview\src\hooks"
if not exist "apps\safeview\src\components"            mkdir "apps\safeview\src\components"
if not exist "apps\safeview\src\pages"                 mkdir "apps\safeview\src\pages"

copy /Y "safeview-patches\src\integrations\supabase\client-local.ts"  "apps\safeview\src\integrations\supabase\client-local.ts" >nul
if errorlevel 1 goto ERRO_PATCH
copy /Y "safeview-patches\src\hooks\useSessionPersistence.ts"          "apps\safeview\src\hooks\useSessionPersistence.ts" >nul
if errorlevel 1 goto ERRO_PATCH
copy /Y "safeview-patches\src\hooks\useEpiDetection.ts"                "apps\safeview\src\hooks\useEpiDetection.ts" >nul
if errorlevel 1 goto ERRO_PATCH
copy /Y "safeview-patches\src\pages\Index.tsx"                         "apps\safeview\src\pages\Index.tsx" >nul
if errorlevel 1 goto ERRO_PATCH
copy /Y "safeview-patches\src\components\TitleBar.tsx"                 "apps\safeview\src\components\TitleBar.tsx" >nul
if errorlevel 1 goto ERRO_PATCH
copy /Y "safeview-patches\src\App.tsx"                                 "apps\safeview\src\App.tsx" >nul
if errorlevel 1 goto ERRO_PATCH
copy /Y "safeview-patches\vite.config.ts"                              "apps\safeview\vite.config.ts" >nul
if errorlevel 1 goto ERRO_PATCH
echo [OK] Patches SafeView aplicados.
goto PATCH_DASHBOARD

:ERRO_PATCH
echo [ERRO] Falha ao copiar arquivo de patch.
echo        Verifique se extraiu o ZIP corretamente.
pause
exit /b 1

:PATCH_DASHBOARD
echo.
echo [5/6] Aplicando patches no Dashboard EPI...
if not exist "apps\dashboard\src\integrations\supabase"    mkdir "apps\dashboard\src\integrations\supabase"
if not exist "apps\dashboard\src\hooks"                    mkdir "apps\dashboard\src\hooks"
if not exist "apps\dashboard\src\pages"                    mkdir "apps\dashboard\src\pages"
if not exist "apps\dashboard\src\components\dashboard"     mkdir "apps\dashboard\src\components\dashboard"
if not exist "apps\dashboard\src\components"               mkdir "apps\dashboard\src\components"
if not exist "apps\dashboard\src\utils"                    mkdir "apps\dashboard\src\utils"

copy /Y "dashboard-patches\src\integrations\supabase\client-local.ts"     "apps\dashboard\src\integrations\supabase\client-local.ts" >nul
if errorlevel 1 goto ERRO_PATCH
copy /Y "dashboard-patches\src\hooks\useMonitoringSessions.ts"             "apps\dashboard\src\hooks\useMonitoringSessions.ts" >nul
if errorlevel 1 goto ERRO_PATCH
copy /Y "dashboard-patches\src\pages\Index.tsx"                            "apps\dashboard\src\pages\Index.tsx" >nul
if errorlevel 1 goto ERRO_PATCH
copy /Y "dashboard-patches\src\pages\SessionDetail.tsx"                    "apps\dashboard\src\pages\SessionDetail.tsx" >nul
if errorlevel 1 goto ERRO_PATCH
copy /Y "dashboard-patches\src\components\dashboard\ChatWidget.tsx"        "apps\dashboard\src\components\dashboard\ChatWidget.tsx" >nul
if errorlevel 1 goto ERRO_PATCH
copy /Y "dashboard-patches\src\components\dashboard\SessionsTable.tsx"      "apps\dashboard\src\components\dashboard\SessionsTable.tsx" >nul
if errorlevel 1 goto ERRO_PATCH
copy /Y "dashboard-patches\src\components\dashboard\FatigueChart.tsx"        "apps\dashboard\src\components\dashboard\FatigueChart.tsx" >nul
if errorlevel 1 goto ERRO_PATCH
copy /Y "dashboard-patches\src\components\dashboard\DashboardHeader.tsx"      "apps\dashboard\src\components\dashboard\DashboardHeader.tsx" >nul
if errorlevel 1 goto ERRO_PATCH
copy /Y "dashboard-patches\src\components\TitleBar.tsx"                    "apps\dashboard\src\components\TitleBar.tsx" >nul
if errorlevel 1 goto ERRO_PATCH
copy /Y "dashboard-patches\src\App.tsx"                                    "apps\dashboard\src\App.tsx" >nul
if errorlevel 1 goto ERRO_PATCH
copy /Y "dashboard-patches\src\utils\exportSessionsReportPdf.ts"           "apps\dashboard\src\utils\exportSessionsReportPdf.ts" >nul
if errorlevel 1 goto ERRO_PATCH
copy /Y "dashboard-patches\vite.config.ts"                                 "apps\dashboard\vite.config.ts" >nul
if errorlevel 1 goto ERRO_PATCH
echo [OK] Patches Dashboard aplicados.

:SETUP_PYTHON
echo.
echo [6/6] Configurando AI Engine (Python)...
if exist "ai_engine\venv" goto SKIP_VENV
echo     Criando ambiente virtual Python...
python -m venv ai_engine\venv
if errorlevel 1 goto ERRO_VENV
echo     [OK] venv criado.
goto INSTALL_PY_DEPS

:SKIP_VENV
echo     [OK] venv Python ja existe.

:INSTALL_PY_DEPS
echo     Instalando dependencias Python (pode demorar alguns minutos)...
call ai_engine\venv\Scripts\pip.exe install -r ai_engine\requirements.txt --quiet
if errorlevel 1 goto ERRO_PY_DEPS
echo     [OK] Dependencias Python instaladas.
goto DOWNLOAD_MODEL

:ERRO_VENV
echo [ERRO] Falha ao criar venv Python.
pause
exit /b 1

:ERRO_PY_DEPS
echo [ERRO] Falha ao instalar dependencias Python.
pause
exit /b 1

:DOWNLOAD_MODEL
echo     Baixando modelo prototipo yolov8n.pt...
call ai_engine\venv\Scripts\python.exe ai_engine\download_model.py
if errorlevel 1 echo     [AVISO] Modelo nao baixado - sera baixado na primeira execucao.
if not errorlevel 1 echo     [OK] Modelo prototipo pronto.
echo [OK] AI Engine configurado.

:CLEAN_BUILDS
echo.
echo Limpando builds anteriores...
if exist "dist-electron"       rmdir /s /q "dist-electron"
if exist "apps\safeview\dist"  rmdir /s /q "apps\safeview\dist"
if exist "apps\dashboard\dist" rmdir /s /q "apps\dashboard\dist"
echo [OK] Builds limpos.

:INSTALL_NODE_ROOT
echo.
echo Instalando dependencias Electron...
call npm install
if errorlevel 1 goto ERRO_NPM_ROOT
echo [OK] Electron OK.
goto INSTALL_NODE_SAFEVIEW

:ERRO_NPM_ROOT
echo [ERRO] npm install raiz falhou.
pause
exit /b 1

:INSTALL_NODE_SAFEVIEW
echo.
echo Instalando dependencias SafeView...
pushd apps\safeview
call npm install
if errorlevel 1 (
    popd
    echo [ERRO] npm install safeview falhou.
    pause
    exit /b 1
)
popd
echo [OK] SafeView OK.

:INSTALL_NODE_DASHBOARD
echo.
echo Instalando dependencias Dashboard...
pushd apps\dashboard
call npm install
if errorlevel 1 (
    popd
    echo [ERRO] npm install dashboard falhou.
    pause
    exit /b 1
)
call npm install react-markdown jspdf html2canvas --save
if errorlevel 1 (
    popd
    echo [ERRO] Instalacao de pacotes extras falhou.
    pause
    exit /b 1
)
popd
echo [OK] Dashboard OK.

:DONE
echo.
echo ============================================================
echo  Setup concluido com sucesso!
echo ============================================================
echo.
echo PROXIMO PASSO - abra um terminal como ADMINISTRADOR e rode:
echo.
echo   cd /d "%CD%"
echo   npm run build
echo.
echo O instalador sera gerado em:
echo   dist-electron\SafeView EPI Setup 1.0.0.exe
echo.
pause
