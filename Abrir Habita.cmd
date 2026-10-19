@echo off
if exist "%~dp0release\0.5.0\Habita-Studio-0.5.0.exe" (
  start "" "%~dp0release\0.5.0\Habita-Studio-0.5.0.exe"
) else if exist "%~dp0release\0.4.0\Habita-Studio-0.4.0.exe" (
  start "" "%~dp0release\0.4.0\Habita-Studio-0.4.0.exe"
) else if exist "%~dp0release\0.3.0\Habita-Studio-0.3.0.exe" (
  start "" "%~dp0release\0.3.0\Habita-Studio-0.3.0.exe"
) else if exist "%~dp0release\0.2.0\Habita-Studio-0.2.0.exe" (
  start "" "%~dp0release\0.2.0\Habita-Studio-0.2.0.exe"
) else if exist "%~dp0release\0.1.6\Habita-Studio-0.1.6.exe" (
  start "" "%~dp0release\0.1.6\Habita-Studio-0.1.6.exe"
) else if exist "%~dp0release\0.1.5\Habita-Studio-0.1.5.exe" (
  start "" "%~dp0release\0.1.5\Habita-Studio-0.1.5.exe"
) else if exist "%~dp0release\0.1.4\Habita-Studio-0.1.4.exe" (
  start "" "%~dp0release\0.1.4\Habita-Studio-0.1.4.exe"
) else if exist "%~dp0release\0.1.3\Habita-Studio-0.1.3.exe" (
  start "" "%~dp0release\0.1.3\Habita-Studio-0.1.3.exe"
) else if exist "%~dp0release\0.1.2\Habita-Studio-0.1.2.exe" (
  start "" "%~dp0release\0.1.2\Habita-Studio-0.1.2.exe"
) else if exist "%~dp0release\0.1.1\Habita-Studio-0.1.1.exe" (
  start "" "%~dp0release\0.1.1\Habita-Studio-0.1.1.exe"
) else if exist "%~dp0release\Habita-Studio-0.1.0.exe" (
  start "" "%~dp0release\Habita-Studio-0.1.0.exe"
) else if exist "%~dp0release\win-unpacked\Habita Studio.exe" (
  start "" "%~dp0release\win-unpacked\Habita Studio.exe"
) else (
  echo Todavia no se ha generado el ejecutable. Ejecuta npm run pack:win.
  pause
)
