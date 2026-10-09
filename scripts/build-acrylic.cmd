@echo off
setlocal
set "QM_ROOT=%~dp0.."
set "QM_VS=C:\Program Files\Microsoft Visual Studio\2022\Community"
if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" for /f "usebackq delims=" %%I in (`"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "QM_VS=%%I"
call "%QM_VS%\VC\Auxiliary\Build\vcvars64.bat"
if errorlevel 1 exit /b 1
cd /d "%QM_ROOT%"
if not exist src-tauri\resources\acrylic mkdir src-tauri\resources\acrylic
cl /nologo /std:c++20 /EHsc /utf-8 /MT /LD /experimental:deterministic /I.scratch\desktop-acrylic-sdk\generated /I.scratch\desktop-acrylic-sdk\microsoft.windowsappsdk.foundation.2.3.12\include tools\desktop-acrylic\bridge.cpp /Fesrc-tauri\resources\acrylic\quickmd-acrylic.dll /Fo.scratch\desktop-acrylic-sdk\bridge.obj /link /Brepro /LIBPATH:.scratch\desktop-acrylic-sdk\microsoft.windowsappsdk.foundation.2.3.12\lib\native\x64 Microsoft.WindowsAppRuntime.Bootstrap.lib CoreMessaging.lib windowsapp.lib dwmapi.lib user32.lib /IMPLIB:.scratch\desktop-acrylic-sdk\quickmd-acrylic.lib
if errorlevel 1 exit /b 1
copy /y .scratch\desktop-acrylic-sdk\microsoft.windowsappsdk.foundation.2.3.12\runtimes\win-x64\native\Microsoft.WindowsAppRuntime.Bootstrap.dll src-tauri\resources\acrylic\Microsoft.WindowsAppRuntime.Bootstrap.dll >nul
copy /y .scratch\desktop-acrylic-sdk\microsoft.windowsappsdk.foundation.2.3.12\license.txt src-tauri\resources\acrylic\SDK-LICENSE.txt >nul
if errorlevel 1 exit /b 1
exit /b 0
