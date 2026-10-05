@echo off
rem Lancement du VS Code de test avec l'extension Froggy chargee (equivalent F5 "Run Extension").
rem Double-cliquer ce fichier : compile l'extension puis ouvre la fenetre "[Extension Development Host]".
setlocal
cd /d "%~dp0"
rem %~dp0 se termine par \ : on le retire, sinon "%ROOT%" donne "...\" et
rem le \" est interprete comme un guillemet echappe (chemin corrompu).
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"

echo === 1/2 Compilation de l'extension ===
call npm run compile
if errorlevel 1 (
  echo.
  echo [ERREUR] La compilation a echoue. VS Code ne sera pas lance.
  pause
  exit /b 1
)

echo.
echo === 2/2 Lancement du VS Code de test ===
rem Lancement direct de Code.exe (detache, ne bloque pas le script).
set "CODE=C:\Program Files\Microsoft VS Code\Code.exe"
if not exist "%CODE%" set "CODE=%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe"
if exist "%CODE%" (
  start "" "%CODE%" --extensionDevelopmentPath="%ROOT%" "%ROOT%\demo-project" --new-window
  goto :opened
)
where code >nul 2>nul
if not errorlevel 1 (
  start "" code --extensionDevelopmentPath="%ROOT%" "%ROOT%\demo-project" --new-window
  goto :opened
)
echo [ERREUR] VS Code introuvable : ni aux emplacements standards ni sur le PATH.
pause
exit /b 1

:opened

echo.
echo Fenetre "[Extension Development Host]" en cours d'ouverture...
echo Pour ouvrir le chat : Ctrl+Shift+P puis "Froggy Agent: Open Main Chat".
echo (Re double-cliquer ce script apres chaque modification du code pour recompiler.)
endlocal
