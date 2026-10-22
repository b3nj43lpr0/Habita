@echo off
rem Abre el ejecutable mas reciente de Habita Studio que haya en release\ (npm run pack:win lo deja ahi).
setlocal
set "RELEASE=%~dp0release"
for /f "delims=" %%F in ('dir /b /o-d "%RELEASE%\Habita-Studio-*.exe" 2^>nul') do (
  start "" "%RELEASE%\%%F"
  goto :eof
)
rem Versiones guardadas en subcarpetas (release\0.8.0\...): la mas reciente por fecha.
for /f "delims=" %%F in ('dir /b /s /o-d "%RELEASE%\Habita-Studio-*.exe" 2^>nul') do (
  start "" "%%F"
  goto :eof
)
if exist "%RELEASE%\win-unpacked\Habita Studio.exe" (
  start "" "%RELEASE%\win-unpacked\Habita Studio.exe"
  goto :eof
)
echo Todavia no se ha generado el ejecutable. Ejecuta: npm run pack:win
pause
