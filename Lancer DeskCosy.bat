@echo off
rem Lance DeskCosy en mode bureau (bande ancrée en bas de l'écran).
cd /d "%~dp0"
python -c "import webview" 2>nul || (
  echo Installation de pywebview pour le mode bureau...
  python -m pip install --user pywebview
)
rem Raccourci sur le Bureau avec l'icône de DeskCosy (créé une seule fois)
set "DC=%~dp0"
powershell -NoProfile -Command "$l=Join-Path ([Environment]::GetFolderPath('Desktop')) 'DeskCosy.lnk'; if(-not(Test-Path $l)){$s=(New-Object -ComObject WScript.Shell).CreateShortcut($l); $s.TargetPath=(Get-Command pythonw).Source; $s.Arguments=[char]34+$env:DC+'DeskCosy.pyw'+[char]34; $s.WorkingDirectory=$env:DC; $s.IconLocation=$env:DC+'assets\img\deskcosy.ico'; $s.Description='DeskCosy'; $s.Save()}" >nul 2>&1
start "" pythonw "%~dp0DeskCosy.pyw"
