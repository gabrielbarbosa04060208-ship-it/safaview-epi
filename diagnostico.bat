@echo off
echo ============================================================
echo  SafeView EPI --- Diagnostico de Dependencias
echo ============================================================
echo.
echo --- Node.js ---
where node
node --version
echo.
echo --- npm ---
where npm
npm --version
echo.
echo --- Git ---
where git
git --version
echo.
echo --- Python ---
where python
python --version
echo.
echo ============================================================
echo  Se algum item mostrou ERRO acima, instale o programa
echo  correspondente antes de rodar o setup.bat
echo ============================================================
echo.
pause
