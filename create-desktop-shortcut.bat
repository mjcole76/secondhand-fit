@echo off
setlocal
rem Puts a "Secondhand Fit" shortcut on your desktop. Double-click the shortcut
rem to start the app; it opens http://localhost:3001 in your browser.
cd /d "%~dp0"
set "TARGET=%~dp0run-dev.bat"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'Secondhand Fit.lnk'));" ^
  "$link.TargetPath = $env:TARGET;" ^
  "$link.WorkingDirectory = (Split-Path $env:TARGET);" ^
  "$link.Description = 'Start Secondhand Fit on http://localhost:3001';" ^
  "$link.IconLocation = \"$env:SystemRoot\System32\shell32.dll,14\";" ^
  "$link.Save()"

if errorlevel 1 (
  echo The shortcut could not be created. You can still double-click run-dev.bat in this folder.
) else (
  echo Done. A "Secondhand Fit" shortcut is now on your desktop.
)
pause
endlocal
