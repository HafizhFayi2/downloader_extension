@echo off
setlocal enabledelayedexpansion
title INSTALLER NATIVE MESSAGING HOST
echo ==========================================
echo  INSTALLER NATIVE MESSAGING HOST
echo  Chrome Performance Extension
echo ==========================================
echo.

REM -----------------------------------------------
REM Dapatkan path absolut folder ekstensi (bukan host\)
REM -----------------------------------------------
set ROOT_DIR=%~dp0
if "%ROOT_DIR:~-1%"=="\" set ROOT_DIR=%ROOT_DIR:~0,-1%

set HOST_DIR=%ROOT_DIR%\host
set HOST_BAT=%HOST_DIR%\host.bat
set HOST_JS=%HOST_DIR%\host.js
set MANIFEST=%HOST_DIR%\com.antigravity.downloader.json

echo [INFO] Folder ekstensi : %ROOT_DIR%
echo [INFO] Folder host      : %HOST_DIR%
echo.

REM -----------------------------------------------
REM Cek apakah host.js ada
REM -----------------------------------------------
if not exist "%HOST_JS%" (
  echo [ERROR] File host.js tidak ditemukan di: %HOST_DIR%
  echo         Pastikan folder "host" ada dan berisi host.js
  pause
  exit /b 1
)

REM -----------------------------------------------
REM Cari Node.js otomatis
REM -----------------------------------------------
set NODE_PATH=
for /f "delims=" %%i in ('where node 2^>nul') do (
  if not defined NODE_PATH set NODE_PATH=%%i
)
if not defined NODE_PATH (
  if exist "C:\Program Files\nodejs\node.exe" set "NODE_PATH=C:\Program Files\nodejs\node.exe"
)
if not defined NODE_PATH (
  if exist "C:\Program Files (x86)\nodejs\node.exe" set "NODE_PATH=C:\Program Files (x86)\nodejs\node.exe"
)
if not defined NODE_PATH (
  echo [ERROR] Node.js tidak ditemukan!
  echo         Install dari https://nodejs.org/ lalu jalankan ulang.
  pause
  exit /b 1
)
echo [INFO] Node.js ditemukan: %NODE_PATH%
echo.

REM -----------------------------------------------
REM Minta Extension ID
REM -----------------------------------------------
echo LANGKAH:
echo  1. Buka browser (Chrome atau Brave)
echo  2. Buka: chrome://extensions/  atau  brave://extensions/
echo  3. Aktifkan "Developer mode" (kanan atas)
echo  4. Klik "Load unpacked" dan pilih folder: %ROOT_DIR%
echo  5. Copy ID ekstensi yang muncul (32 karakter huruf kecil)
echo.
set /p EXT_ID="Paste Extension ID di sini: "
echo.

REM -----------------------------------------------
REM Tanya browser target
REM -----------------------------------------------
echo Daftarkan untuk browser mana?
echo  1. Chrome saja
echo  2. Brave saja
echo  3. Chrome DAN Brave (keduanya) [DEFAULT]
echo  4. Microsoft Edge saja
echo  5. Semua (Chrome + Brave + Edge)
echo.
set /p BROWSER_CHOICE="Pilih (1/2/3/4/5) [Enter = 3]: "
if "%BROWSER_CHOICE%"=="" set BROWSER_CHOICE=3
echo.

REM -----------------------------------------------
REM Buat file host.bat baru dengan path absolut
REM -----------------------------------------------
echo [INFO] Membuat host.bat...
(
  echo @echo off
  echo "%NODE_PATH%" "%HOST_DIR%\host.js" 2^> "%HOST_DIR%\host_error.log"
) > "%HOST_BAT%"
echo [OK] host.bat: %HOST_BAT%

REM -----------------------------------------------
REM Buat manifest JSON
REM -----------------------------------------------
echo [INFO] Membuat manifest JSON...
(
  echo {
  echo   "name": "com.antigravity.downloader",
  echo   "description": "Local Downloader Host",
  echo   "path": "%HOST_BAT:\=\\%",
  echo   "type": "stdio",
  echo   "allowed_origins": [
  echo     "chrome-extension://%EXT_ID%/"
  echo   ]
  echo }
) > "%MANIFEST%"
echo [OK] Manifest: %MANIFEST%
echo.

REM -----------------------------------------------
REM Daftarkan ke Registry sesuai pilihan
REM -----------------------------------------------
set REG_NAME=com.antigravity.downloader
set REG_CHROME=HKCU\Software\Google\Chrome\NativeMessagingHosts\%REG_NAME%
set REG_BRAVE=HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\%REG_NAME%
set REG_EDGE=HKCU\Software\Microsoft\Edge\NativeMessagingHosts\%REG_NAME%

if "%BROWSER_CHOICE%"=="1" (
  echo [INFO] Mendaftarkan ke Chrome...
  REG ADD "%REG_CHROME%" /ve /t REG_SZ /d "%MANIFEST%" /f >nul && echo [OK] Chrome terdaftar.
  goto reg_done
)
if "%BROWSER_CHOICE%"=="2" (
  echo [INFO] Mendaftarkan ke Brave...
  REG ADD "%REG_BRAVE%" /ve /t REG_SZ /d "%MANIFEST%" /f >nul && echo [OK] Brave terdaftar.
  goto reg_done
)
if "%BROWSER_CHOICE%"=="3" (
  echo [INFO] Mendaftarkan ke Chrome...
  REG ADD "%REG_CHROME%" /ve /t REG_SZ /d "%MANIFEST%" /f >nul && echo [OK] Chrome terdaftar.
  echo [INFO] Mendaftarkan ke Brave...
  REG ADD "%REG_BRAVE%" /ve /t REG_SZ /d "%MANIFEST%" /f >nul && echo [OK] Brave terdaftar.
  goto reg_done
)
if "%BROWSER_CHOICE%"=="4" (
  echo [INFO] Mendaftarkan ke Edge...
  REG ADD "%REG_EDGE%" /ve /t REG_SZ /d "%MANIFEST%" /f >nul && echo [OK] Edge terdaftar.
  goto reg_done
)
if "%BROWSER_CHOICE%"=="5" (
  echo [INFO] Mendaftarkan ke Chrome...
  REG ADD "%REG_CHROME%" /ve /t REG_SZ /d "%MANIFEST%" /f >nul && echo [OK] Chrome terdaftar.
  echo [INFO] Mendaftarkan ke Brave...
  REG ADD "%REG_BRAVE%" /ve /t REG_SZ /d "%MANIFEST%" /f >nul && echo [OK] Brave terdaftar.
  echo [INFO] Mendaftarkan ke Edge...
  REG ADD "%REG_EDGE%" /ve /t REG_SZ /d "%MANIFEST%" /f >nul && echo [OK] Edge terdaftar.
  goto reg_done
)
REM fallback ke Chrome+Brave
echo [INFO] Mendaftarkan ke Chrome...
REG ADD "%REG_CHROME%" /ve /t REG_SZ /d "%MANIFEST%" /f >nul && echo [OK] Chrome terdaftar.
echo [INFO] Mendaftarkan ke Brave...
REG ADD "%REG_BRAVE%" /ve /t REG_SZ /d "%MANIFEST%" /f >nul && echo [OK] Brave terdaftar.

:reg_done
echo.
echo ==========================================
echo  INSTALASI SELESAI!
echo ==========================================
echo  Host BAT  : %HOST_BAT%
echo  Manifest  : %MANIFEST%
echo  Extension : chrome-extension://%EXT_ID%/
echo ==========================================
echo.
echo LANGKAH SELANJUTNYA:
echo  1. Tutup browser lalu buka kembali
echo  2. Buka halaman extensions dan klik "Reload" pada ekstensi ini
echo  3. Coba fitur download - harus sudah berfungsi!
echo.
pause
