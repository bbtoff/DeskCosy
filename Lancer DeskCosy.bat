@echo off
rem Lance DeskCosy en mode bureau (bande ancrée en bas de l'écran).
cd /d "%~dp0"
python -c "import webview" 2>nul || (
  echo Installation de pywebview pour le mode bureau...
  python -m pip install --user pywebview
)
start "" pythonw "%~dp0DeskCosy.pyw"
