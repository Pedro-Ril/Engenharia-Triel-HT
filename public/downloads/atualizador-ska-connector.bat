@echo off
setlocal

chcp 1252 >nul

if not exist C:\Temp mkdir C:\Temp

set ORIGEM="\\servidorgeral\3DX Instaladores\SKA Connector (Integrador)\SKACONNECTOR"
set DESTINO="C:\SKACONNECTOR"
set LOG=C:\Temp\atualizacao_skaconnector.log

set REGASM="C:\Windows\Microsoft.NET\Framework64\v4.0.30319\regasm.exe"
set DLL="C:\SKACONNECTOR\IntegradorSW.dll"

echo =============================================== >> %LOG%
echo INICIO: %date% %time% >> %LOG%
echo =============================================== >> %LOG%

echo. >> %LOG%
echo === ROBOCOPY === >> %LOG%

robocopy %ORIGEM% %DESTINO% /E /Z /R:2 /W:3 /FFT /IS /IT /NP /LOG+:%LOG%

echo. >> %LOG%
echo === REGISTRO === >> %LOG%

reg query "HKCR\CLSID" /s /f "IntegradorSW.dll" >nul 2>&1

if %errorlevel%==0 (
    echo DLL ja registrada. Nenhuma acao necessaria. >> %LOG%
) else (
    echo DLL nao registrada. Executando REGASM... >> %LOG%
    if exist %DLL% (
        %REGASM% %DLL% /codebase >> %LOG% 2>&1
    ) else (
        echo ERRO: DLL nao encontrada em %DLL% >> %LOG%
    )
)

echo. >> %LOG%
echo FIM: %date% %time% >> %LOG%
echo =============================================== >> %LOG%

endlocal
exit /b