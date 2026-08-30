import { NextResponse } from "next/server";

import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { buscarConfigTv } from "@/lib/tv/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Comando de instalação de uma linha só pro Windows (PowerShell como
 * administrador):
 *   irm https://<portal>/api/tv/agente/instalar.ps1 | iex
 *
 * Mesma ideia do instalar.sh (ver rota irmã) - URL do portal vem de
 * portal_tv_config.url_agente se o admin configurou um endereço
 * específico pros mini-PCs (TV Corporativa → Configurações), senão da
 * origem da própria requisição. Tarefa agendada em vez de
 * serviço do Windows de verdade (evita depender de NSSM ou de
 * empacotar o agente como serviço nativo, e ainda reinicia sozinho em
 * caso de falha via RestartCount/RestartInterval). Instala Node.js e
 * Edge via winget se não encontrar nenhum dos dois já instalados -
 * precisa do winget disponível (padrão em Windows 10 2004+/11) e de
 * internet no mini-PC; se não tiver winget, para com uma mensagem
 * clara em vez de deixar o agente rodando sem navegador. O script
 * gerado usa só ASCII (sem acento/travessão) — o pipeline
 * `irm ... | iex` do PowerShell 5.1 não garante decodificação UTF-8
 * do conteúdo baixado sem BOM, e um caractere não-ASCII vira lixo que
 * quebra o parser (já visto num teste: um travessão virou 3 bytes
 * errados que estouraram a contagem de aspas do script inteiro).
 */
async function handleGET(request: Request) {
  const config = await buscarConfigTv();
  const origem = config.urlAgente || new URL(request.url).origin;

  const script = `$ErrorActionPreference = "Stop"

$PortalUrl = "${origem}"
$Dir = "$env:PROGRAMDATA\\PortalTrielHT\\tv-agente"

$IsAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $IsAdmin) {
    Write-Error "Rode este script como Administrador."
    exit 1
}

function Atualizar-PathDaSessao {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js nao encontrado -instalando..."

    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Error "winget nao disponivel neste Windows -instale o Node.js manualmente (https://nodejs.org) e rode este script de novo."
        exit 1
    }

    winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    Atualizar-PathDaSessao

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Error "O Node.js foi instalado, mas nao foi encontrado nesta sessao -abra um novo PowerShell como Administrador e rode o comando de novo."
        exit 1
    }
}

$CaminhosNavegador = @(
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
)
$TemNavegador = $CaminhosNavegador | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $TemNavegador) {
    Write-Host "Navegador nao encontrado -instalando o Microsoft Edge..."

    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Error "winget nao disponivel neste Windows -instale o Chrome ou o Edge manualmente e rode este script de novo."
        exit 1
    }

    winget install --id Microsoft.Edge --silent --accept-package-agreements --accept-source-agreements
}

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Invoke-WebRequest -Uri "$PortalUrl/api/tv/agente/download?plataforma=windows" -OutFile "$Dir\\agente.mjs"

$NodePath = (Get-Command node).Source
$WrapperPath = "$Dir\\iniciar-agente.ps1"

$WrapperContent = @'
$env:PORTAL_TV_URL = "__PORTAL_URL__"
& "__NODE_PATH__" "__AGENT_PATH__"
'@
$WrapperContent = $WrapperContent.Replace("__PORTAL_URL__", $PortalUrl)
$WrapperContent = $WrapperContent.Replace("__NODE_PATH__", $NodePath)
$WrapperContent = $WrapperContent.Replace("__AGENT_PATH__", "$Dir\\agente.mjs")
Set-Content -Path $WrapperPath -Value $WrapperContent -Encoding utf8

$QuotedWrapperPath = [char]34 + $WrapperPath + [char]34
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ("-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " + $QuotedWrapperPath)
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName "TV Corporativa Agente" -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null
Start-ScheduledTask -TaskName "TV Corporativa Agente"

Write-Host "Agente instalado e iniciado como tarefa agendada (TV Corporativa Agente)."
`;

  return new NextResponse(script, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export const GET = comMetricasApi("tv/agente/instalar.ps1", handleGET);
