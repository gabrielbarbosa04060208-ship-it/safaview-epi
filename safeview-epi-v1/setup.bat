@echo off
echo ============================================
echo  SafeView Desktop --- Setup Automatico
echo  (inclui SafeView EPI)
echo ============================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Node.js nao encontrado! Instale em https://nodejs.org & pause & exit /b 1 )
echo [OK] Node.js encontrado.

where git >nul 2>nul
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Git nao encontrado! Instale em https://git-scm.com & pause & exit /b 1 )
echo [OK] Git encontrado.

if not exist "apps" mkdir apps

if not exist "apps\safeview" (
    echo. & echo [1/5] Clonando SafeView...
    git clone https://github.com/gabrielbarbosa04060208-ship-it/safeview40.git apps\safeview
    if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha ao clonar SafeView. & pause & exit /b 1 )
    echo [OK] SafeView clonado.
) else ( echo [OK] SafeView ja existe. )

if not exist "apps\dashboard" (
    echo. & echo [2/5] Clonando Dashboard...
    git clone https://github.com/gabrielbarbosa04060208-ship-it/dashboardsafeview.git apps\dashboard
    if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha ao clonar Dashboard. & pause & exit /b 1 )
    echo [OK] Dashboard clonado.
) else ( echo [OK] Dashboard ja existe. )

if not exist "apps\safeview-epi" (
    echo. & echo [3/5] Criando SafeView EPI (clone do SafeView)...
    xcopy /E /I /Q "apps\safeview" "apps\safeview-epi"
    if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha ao copiar SafeView para safeview-epi. & pause & exit /b 1 )
    echo [OK] SafeView EPI criado.
) else ( echo [OK] SafeView EPI ja existe. )

echo.
echo Aplicando patches no SafeView...
if not exist "apps\safeview\src\integrations\supabase" mkdir "apps\safeview\src\integrations\supabase"
if not exist "apps\safeview\src\hooks"       mkdir "apps\safeview\src\hooks"
if not exist "apps\safeview\src\components"  mkdir "apps\safeview\src\components"

copy /Y "safeview-patches\src\integrations\supabase\client-local.ts" "apps\safeview\src\integrations\supabase\client-local.ts"
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha ao copiar client-local.ts do SafeView. & pause & exit /b 1 )
copy /Y "safeview-patches\src\hooks\useSessionPersistence.ts" "apps\safeview\src\hooks\useSessionPersistence.ts"
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha ao copiar useSessionPersistence.ts. & pause & exit /b 1 )
copy /Y "safeview-patches\src\App.tsx" "apps\safeview\src\App.tsx"
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha ao copiar App.tsx do SafeView. & pause & exit /b 1 )
copy /Y "safeview-patches\src\components\TitleBar.tsx" "apps\safeview\src\components\TitleBar.tsx"
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha ao copiar TitleBar.tsx do SafeView. & pause & exit /b 1 )
copy /Y "safeview-patches\vite.config.ts" "apps\safeview\vite.config.ts"
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha ao copiar vite.config.ts do SafeView. & pause & exit /b 1 )
echo [OK] Patches do SafeView aplicados.

echo.
echo Copiando icone...
if not exist "electron" mkdir "electron"
copy /Y "assets\icon.ico" "electron\icon.ico"
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha ao copiar icon.ico. & pause & exit /b 1 )
copy /Y "assets\icon.png" "electron\icon.png"
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha ao copiar icon.png. & pause & exit /b 1 )
echo [OK] Icone copiado.

echo.
echo Aplicando patches no Dashboard...
if not exist "apps\dashboard\src\integrations\supabase" mkdir "apps\dashboard\src\integrations\supabase"
if not exist "apps\dashboard\src\hooks"            mkdir "apps\dashboard\src\hooks"
if not exist "apps\dashboard\src\pages"            mkdir "apps\dashboard\src\pages"
if not exist "apps\dashboard\src\components\dashboard" mkdir "apps\dashboard\src\components\dashboard"
if not exist "apps\dashboard\src\components"       mkdir "apps\dashboard\src\components"
if not exist "apps\dashboard\src\utils"            mkdir "apps\dashboard\src\utils"

copy /Y "dashboard-patches\src\integrations\supabase\client-local.ts" "apps\dashboard\src\integrations\supabase\client-local.ts"
copy /Y "dashboard-patches\src\hooks\useMonitoringSessions.ts"        "apps\dashboard\src\hooks\useMonitoringSessions.ts"
copy /Y "dashboard-patches\src\pages\Index.tsx"                       "apps\dashboard\src\pages\Index.tsx"
copy /Y "dashboard-patches\src\pages\SessionDetail.tsx"               "apps\dashboard\src\pages\SessionDetail.tsx"
copy /Y "dashboard-patches\src\components\dashboard\ChatWidget.tsx"   "apps\dashboard\src\components\dashboard\ChatWidget.tsx"
copy /Y "dashboard-patches\src\App.tsx"                               "apps\dashboard\src\App.tsx"
copy /Y "dashboard-patches\src\components\TitleBar.tsx"               "apps\dashboard\src\components\TitleBar.tsx"
copy /Y "dashboard-patches\src\utils\exportSessionsReportPdf.ts"      "apps\dashboard\src\utils\exportSessionsReportPdf.ts"
copy /Y "dashboard-patches\vite.config.ts"                            "apps\dashboard\vite.config.ts"
echo [OK] Patches do Dashboard aplicados.

echo.
echo [4/5] Aplicando patches no SafeView EPI...
REM Bug fix #7: criar diretorio integrations/supabase e copiar client-local.ts
REM useEpiSessionPersistence importa localApi deste arquivo -- sem ele crasharia em runtime
if not exist "apps\safeview-epi\src\integrations\supabase" mkdir "apps\safeview-epi\src\integrations\supabase"
if not exist "apps\safeview-epi\src\hooks"       mkdir "apps\safeview-epi\src\hooks"
if not exist "apps\safeview-epi\src\pages"       mkdir "apps\safeview-epi\src\pages"
if not exist "apps\safeview-epi\src\components"  mkdir "apps\safeview-epi\src\components"
if not exist "apps\safeview-epi\public\models"   mkdir "apps\safeview-epi\public\models"
if not exist "apps\safeview-epi\public\ort-wasm" mkdir "apps\safeview-epi\public\ort-wasm"

copy /Y "safeview-patches\src\integrations\supabase\client-local.ts" "apps\safeview-epi\src\integrations\supabase\client-local.ts"
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha ao copiar client-local.ts para safeview-epi. & pause & exit /b 1 )
copy /Y "epi-patches\src\hooks\useEpiDetector.ts"           "apps\safeview-epi\src\hooks\useEpiDetector.ts"
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha ao copiar useEpiDetector.ts. & pause & exit /b 1 )
copy /Y "epi-patches\src\hooks\useEpiSessionPersistence.ts" "apps\safeview-epi\src\hooks\useEpiSessionPersistence.ts"
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha ao copiar useEpiSessionPersistence.ts. & pause & exit /b 1 )
copy /Y "epi-patches\src\pages\Index.tsx"                   "apps\safeview-epi\src\pages\Index.tsx"
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha ao copiar Index.tsx do EPI. & pause & exit /b 1 )
copy /Y "epi-patches\src\App.tsx"                           "apps\safeview-epi\src\App.tsx"
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha ao copiar App.tsx do EPI. & pause & exit /b 1 )
copy /Y "epi-patches\src\components\TitleBar.tsx"           "apps\safeview-epi\src\components\TitleBar.tsx"
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha ao copiar TitleBar.tsx do EPI. & pause & exit /b 1 )
copy /Y "epi-patches\vite.config.ts"                        "apps\safeview-epi\vite.config.ts"
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha ao copiar vite.config.ts do EPI. & pause & exit /b 1 )

if exist "assets\best.onnx" (
    copy /Y "assets\best.onnx" "apps\safeview-epi\public\models\best.onnx"
    echo [OK] best.onnx copiado para public/models/.
) else (
    echo [AVISO] assets\best.onnx nao encontrado.
    echo         Execute export_onnx.py e copie best.onnx para assets\
)
echo [OK] Patches do SafeView EPI aplicados.

echo.
echo Limpando builds anteriores...
if exist "dist-electron"            rmdir /s /q "dist-electron"
if exist "apps\safeview\dist"       rmdir /s /q "apps\safeview\dist"
if exist "apps\dashboard\dist"      rmdir /s /q "apps\dashboard\dist"
if exist "apps\safeview-epi\dist"   rmdir /s /q "apps\safeview-epi\dist"
echo [OK] Builds anteriores removidos.

echo.
echo Instalando dependencias do Electron...
call npm install
if %ERRORLEVEL% NEQ 0 ( echo [ERRO] Falha nas dependencias do Electron. & pause & exit /b 1 )
echo [OK] Electron instalado.

echo.
echo Instalando dependencias do SafeView...
pushd apps\safeview
call npm install --legacy-peer-deps
if %ERRORLEVEL% NEQ 0 ( popd & echo [ERRO] Falha nas dependencias do SafeView. & pause & exit /b 1 )
popd
echo [OK] SafeView instalado.

echo.
echo Instalando dependencias do Dashboard...
pushd apps\dashboard
call npm install --legacy-peer-deps
if %ERRORLEVEL% NEQ 0 ( popd & echo [ERRO] Falha nas dependencias do Dashboard. & pause & exit /b 1 )
call npm install react-markdown jspdf html2canvas
if %ERRORLEVEL% NEQ 0 ( popd & echo [ERRO] Falha ao instalar deps extras do Dashboard. & pause & exit /b 1 )
popd
echo [OK] Dashboard instalado.

echo.
echo [5/5] Instalando dependencias do SafeView EPI...
pushd apps\safeview-epi
call npm install --legacy-peer-deps
if %ERRORLEVEL% NEQ 0 ( popd & echo [ERRO] Falha nas dependencias do SafeView EPI. & pause & exit /b 1 )
call npm install onnxruntime-web
if %ERRORLEVEL% NEQ 0 ( popd & echo [ERRO] Falha ao instalar onnxruntime-web. & pause & exit /b 1 )
popd

echo Copiando WASM do onnxruntime-web...
xcopy /Y /Q "apps\safeview-epi\node_modules\onnxruntime-web\dist\*.wasm" "apps\safeview-epi\public\ort-wasm\"
xcopy /Y /Q "apps\safeview-epi\node_modules\onnxruntime-web\dist\*.mjs"  "apps\safeview-epi\public\ort-wasm\"
echo [OK] SafeView EPI instalado.

echo.
echo ============================================
echo  Setup concluido com sucesso!
echo ============================================
echo.
echo ANTES DO BUILD:
echo   1. python export_onnx.py
echo   2. Confirme que assets\best.onnx existe
echo   3. Edite electron\main.js conforme
echo      epi-patches\electron-main-changes.js
echo.
echo PROXIMO PASSO:
echo   npm run build   (como Administrador)
echo.
pause
