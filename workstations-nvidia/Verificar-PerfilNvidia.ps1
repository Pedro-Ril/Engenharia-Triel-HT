<#
.SYNOPSIS
  Confere se o perfil NVIDIA oficial está aplicado nesta workstation e,
  se estiver divergente, reaplica. Grava o resultado em estado.json,
  que o Portal Triel-HT lê direto da máquina.

.DESCRIPTION
  Fluxo:
    1. Lê GPU e versão do driver (Win32_VideoController).
    2. Roda "nvidiaProfileInspector.exe -exportCustomized" (só o que difere
       do padrão NVIDIA) e compara com o perfil oficial (perfil-padrao.nip),
       configuração por configuração (perfil + SettingID + valor).
       Configurações extras na máquina (ex: "List of Universal GPU ids",
       que o próprio driver grava) são ignoradas.
    3. Se divergente: importa o perfil oficial (-silentImport -mergeImport),
       exporta de novo e confere — é essa segunda conferência que diz se
       deu certo, porque o Profile Inspector sai sempre com código 0.
    4. Grava estado.json (UTF-8 sem BOM) e uma linha em historico.log.

  Requer o NVIDIA Profile Inspector 3.x (o -exportCustomized não existe no 2.x)
  e execução como administrador ou SYSTEM.

  O Profile Inspector abre uma janela de erro (bloqueante) se a importação
  falhar, mesmo em modo silencioso — por isso cada chamada tem tempo limite
  e o processo é encerrado se passar dele.

.PARAMETER Pasta
  Pasta que recebe estado.json, historico.log e ultimo-export.nip.
  O nvidiaProfileInspector.exe é procurado nela e nas subpastas.
  Padrão: a pasta deste script.

.PARAMETER PerfilOficial
  Caminho do .nip oficial (local ou UNC). Padrão: <Pasta>\perfil-padrao.nip.

.PARAMETER SomenteVerificar
  Só confere e grava o estado, sem reaplicar.

.PARAMETER UsarExport
  Usa um export já existente em vez de rodar o Profile Inspector
  (para testes). Implica -SomenteVerificar.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File C:\ProgramData\TI\NvidiaProfile\Verificar-PerfilNvidia.ps1
#>
[CmdletBinding()]
param(
    [string]$Pasta,
    [string]$PerfilOficial,
    [switch]$SomenteVerificar,
    [string]$UsarExport,
    [int]$TimeoutSegundos = 60
)

$ErrorActionPreference = 'Stop'
$VersaoScript = 1

# No PowerShell 5.1, $PSScriptRoot vem vazio como valor padrão de param()
# quando o script é chamado com -File -- resolve aqui no corpo.
if (-not $Pasta) { $Pasta = $PSScriptRoot }
if (-not $Pasta) { $Pasta = Split-Path -Parent $MyInvocation.MyCommand.Path }

if (-not $PerfilOficial) { $PerfilOficial = Join-Path $Pasta 'perfil-padrao.nip' }
if ($UsarExport) { $SomenteVerificar = $true }

# O .exe pode estar direto na pasta ou numa subpasta (o zip do Profile
# Inspector costuma ser extraído para nvidiaProfileInspector\).
$Exe = Join-Path $Pasta 'nvidiaProfileInspector.exe'
if (-not (Test-Path $Exe)) {
    $encontrado = Get-ChildItem -Path $Pasta -Filter 'nvidiaProfileInspector.exe' -File -Recurse -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($encontrado) { $Exe = $encontrado.FullName }
}
# O -exportCustomized grava o CustomProfiles_*.nip ao lado do .exe.
$PastaExe = Split-Path -Parent $Exe

$ArquivoEstado = Join-Path $Pasta 'estado.json'
$ArquivoHistorico = Join-Path $Pasta 'historico.log'
$ArquivoUltimoExport = Join-Path $Pasta 'ultimo-export.nip'

function Get-DataIso([datetime]$Data) {
    return $Data.ToString('yyyy-MM-ddTHH:mm:sszzz')
}

function Write-Historico([string]$Mensagem) {
    $linha = '{0}  {1}' -f (Get-DataIso (Get-Date)), $Mensagem
    try { Add-Content -Path $ArquivoHistorico -Value $linha -Encoding UTF8 } catch { }
}

# 32.0.15.9671 -> 596.71: últimos 5 dígitos dos dois últimos blocos.
function Convert-VersaoDriverNvidia([string]$VersaoWindows) {
    if (-not $VersaoWindows) { return $null }
    $partes = $VersaoWindows.Split('.')
    if ($partes.Count -lt 4) { return $null }
    $digitos = $partes[2] + $partes[3].PadLeft(4, '0')
    if ($digitos.Length -lt 5) { return $null }
    $ultimos = $digitos.Substring($digitos.Length - 5)
    return '{0}.{1}' -f [int]$ultimos.Substring(0, 3), $ultimos.Substring(3)
}

# O Profile Inspector grava o .nip em UTF-8 com BOM, mas declara
# encoding="utf-16" no cabeçalho -- XmlDocument.Load() recusa isso. Lê o
# texto respeitando o BOM (UTF-8 ou UTF-16) e usa LoadXml(), que ignora
# a declaração de encoding.
function Read-PerfisNip([string]$Caminho) {
    $texto = [System.IO.File]::ReadAllText($Caminho)
    $xml = New-Object System.Xml.XmlDocument
    $xml.LoadXml($texto)

    $lista = @()
    foreach ($perfil in $xml.SelectNodes('/ArrayOfProfile/Profile')) {
        $nomePerfil = $perfil.SelectSingleNode('ProfileName').InnerText
        foreach ($cfg in $perfil.SelectNodes('Settings/ProfileSetting')) {
            $lista += [pscustomobject]@{
                Perfil = $nomePerfil
                Id     = $cfg.SelectSingleNode('SettingID').InnerText
                Nome   = $cfg.SelectSingleNode('SettingNameInfo').InnerText
                Valor  = $cfg.SelectSingleNode('SettingValue').InnerText
                Tipo   = $cfg.SelectSingleNode('ValueType').InnerText
            }
        }
    }
    return ,$lista
}

function Compare-Perfis($Oficial, $Atual) {
    $divergencias = @()
    foreach ($esperado in $Oficial) {
        $encontrado = $Atual |
            Where-Object { $_.Perfil -eq $esperado.Perfil -and $_.Id -eq $esperado.Id } |
            Select-Object -First 1

        if (-not $encontrado -or $encontrado.Valor -ne $esperado.Valor) {
            $valorEncontrado = $null
            if ($encontrado) { $valorEncontrado = $encontrado.Valor }

            $divergencias += [pscustomobject][ordered]@{
                perfil         = $esperado.Perfil
                configuracaoId = $esperado.Id
                configuracao   = $esperado.Nome
                esperado       = $esperado.Valor
                encontrado     = $valorEncontrado
            }
        }
    }
    return ,$divergencias
}

function Invoke-ProfileInspector([string[]]$Argumentos) {
    $proc = Start-Process -FilePath $Exe -ArgumentList $Argumentos -WorkingDirectory $PastaExe -PassThru -WindowStyle Hidden
    if (-not $proc.WaitForExit($TimeoutSegundos * 1000)) {
        try { $proc.Kill() } catch { }
        throw "O Profile Inspector não terminou em $TimeoutSegundos s (provável janela de erro aberta) e foi encerrado."
    }
}

function Export-PerfisAtuais {
    if ($UsarExport) { return ,(Read-PerfisNip $UsarExport) }

    $inicio = (Get-Date).AddSeconds(-2)
    Invoke-ProfileInspector @('-exportCustomized')

    $arquivo = Get-ChildItem -Path @($PastaExe, $Pasta) -Filter 'CustomProfiles_*.nip' -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -ge $inicio } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $arquivo) {
        throw 'O export (-exportCustomized) não gerou nenhum arquivo CustomProfiles_*.nip.'
    }

    Copy-Item -Path $arquivo.FullName -Destination $ArquivoUltimoExport -Force

    # Limpa este export e qualquer sobra de execuções anteriores (ex: rodadas
    # manuais sem elevação, em que o Profile Inspector gravou como
    # administrador e o script não conseguiu apagar).
    Get-ChildItem -Path @($PastaExe, $Pasta) -Filter 'CustomProfiles_*.nip' -File -ErrorAction SilentlyContinue |
        Remove-Item -Force -ErrorAction SilentlyContinue

    return ,(Read-PerfisNip $ArquivoUltimoExport)
}

# ---------------------------------------------------------------------------

$estadoAnterior = $null
if (Test-Path $ArquivoEstado) {
    try { $estadoAnterior = Get-Content -Path $ArquivoEstado -Raw -Encoding UTF8 | ConvertFrom-Json } catch { }
}

$estado = [ordered]@{
    versaoScript              = $VersaoScript
    computador                = $env:COMPUTERNAME
    executadoComo             = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    verificadoEm              = Get-DataIso (Get-Date)
    gpu                       = $null
    driverAnterior            = $null
    perfilOficial             = $null
    conforme                  = $false
    acao                      = 'nenhuma'
    divergenciasEncontradas   = @()
    divergenciasAposReaplicar = @()
    ultimaReaplicacao         = $null
    erro                      = $null
}

if ($estadoAnterior) {
    $estado.ultimaReaplicacao = $estadoAnterior.ultimaReaplicacao
    if ($estadoAnterior.gpu) { $estado.driverAnterior = $estadoAnterior.gpu.driverNvidia }
}

try {
    $gpu = Get-CimInstance -ClassName Win32_VideoController |
        Where-Object { $_.Name -like '*NVIDIA*' } |
        Select-Object -First 1
    if (-not $gpu) { throw 'Nenhuma placa NVIDIA encontrada nesta máquina.' }

    $dataDriver = $null
    if ($gpu.DriverDate) { $dataDriver = $gpu.DriverDate.ToString('yyyy-MM-dd') }

    $estado.gpu = [ordered]@{
        nome          = $gpu.Name
        driverWindows = $gpu.DriverVersion
        driverNvidia  = Convert-VersaoDriverNvidia $gpu.DriverVersion
        dataDriver    = $dataDriver
    }

    if ($estado.driverAnterior -and $estado.driverAnterior -ne $estado.gpu.driverNvidia) {
        Write-Historico "Driver mudou: $($estado.driverAnterior) -> $($estado.gpu.driverNvidia)"
    }

    if (-not $UsarExport -and -not (Test-Path $Exe)) { throw "Não encontrei $Exe." }
    if (-not (Test-Path $PerfilOficial)) { throw "Não encontrei o perfil oficial em $PerfilOficial." }

    if (-not $UsarExport -and (Get-Process -Name 'nvidiaProfileInspector' -ErrorAction SilentlyContinue)) {
        $estado.acao = 'adiado'
        throw 'O Profile Inspector está aberto nesta máquina; a verificação fica para a próxima execução.'
    }

    $oficial = Read-PerfisNip $PerfilOficial
    if ($oficial.Count -eq 0) { throw 'O perfil oficial não tem nenhuma configuração.' }

    $estado.perfilOficial = [ordered]@{
        arquivo       = $PerfilOficial
        hash          = (Get-FileHash -Path $PerfilOficial -Algorithm SHA256).Hash
        configuracoes = $oficial.Count
    }

    $atual = Export-PerfisAtuais
    $divergencias = Compare-Perfis $oficial $atual
    $estado.divergenciasEncontradas = $divergencias

    if ($divergencias.Count -eq 0) {
        $estado.conforme = $true
    }
    elseif ($SomenteVerificar) {
        $estado.acao = 'somente_verificacao'
        Write-Historico "Divergente ($($divergencias.Count) configuração(ões)); modo somente verificação."
    }
    else {
        Write-Historico "Divergente ($($divergencias.Count) configuração(ões)); reaplicando o perfil oficial."
        $estado.acao = 'reaplicando'

        Invoke-ProfileInspector @("`"$PerfilOficial`"", '-silentImport', '-mergeImport')

        $atual = Export-PerfisAtuais
        $restantes = Compare-Perfis $oficial $atual
        $estado.divergenciasAposReaplicar = $restantes
        $estado.conforme = ($restantes.Count -eq 0)

        if ($estado.conforme) {
            $estado.acao = 'reaplicado'
            Write-Historico 'Reaplicação OK: perfil conforme.'
        }
        else {
            $estado.acao = 'falha_reaplicacao'
            Write-Historico "Reaplicação falhou: ainda $($restantes.Count) configuração(ões) divergente(s)."
        }

        $estado.ultimaReaplicacao = [ordered]@{
            em           = Get-DataIso (Get-Date)
            driverNvidia = $estado.gpu.driverNvidia
            perfilHash   = $estado.perfilOficial.hash
            sucesso      = $estado.conforme
        }
    }
}
catch {
    $estado.erro = $_.Exception.Message

    if ($estado.acao -eq 'reaplicando') {
        $estado.acao = 'falha_reaplicacao'
        $estado.ultimaReaplicacao = [ordered]@{
            em           = Get-DataIso (Get-Date)
            driverNvidia = $(if ($estado.gpu) { $estado.gpu.driverNvidia } else { $null })
            perfilHash   = $(if ($estado.perfilOficial) { $estado.perfilOficial.hash } else { $null })
            sucesso      = $false
        }
    }
    elseif ($estado.acao -eq 'nenhuma') {
        $estado.acao = 'erro'
    }

    Write-Historico "ERRO: $($estado.erro)"
}

# Grava em arquivo temporário e troca, para o portal nunca ler um JSON pela metade.
$json = $estado | ConvertTo-Json -Depth 6
$temporario = "$ArquivoEstado.tmp"
[System.IO.File]::WriteAllText($temporario, $json, (New-Object System.Text.UTF8Encoding($false)))
Move-Item -Path $temporario -Destination $ArquivoEstado -Force

if ($estado.conforme) { exit 0 } else { exit 1 }
