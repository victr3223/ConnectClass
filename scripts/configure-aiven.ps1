# Run locally: credentials are entered privately and sent to the child over stdin.
param([switch]$InspectOnly)
$ErrorActionPreference = 'Stop'
function Invoke-AivenBootstrap {
    param([string]$ProjectRoot, [string]$InputJson, [switch]$InspectOnly)
    $aivenProcessInfo = [Diagnostics.ProcessStartInfo]::new()
    $aivenProcessInfo.FileName = (Get-Command node.exe).Source
    $aivenScript = Join-Path $ProjectRoot 'scripts\bootstrap-aiven.js'
    $aivenProcessInfo.Arguments = '"' + $aivenScript + '"' + $(if ($InspectOnly) { ' --inspect' } else { '' })
    $aivenProcessInfo.WorkingDirectory = $ProjectRoot
    $aivenProcessInfo.UseShellExecute = $false
    $aivenProcessInfo.CreateNoWindow = $true
    $aivenProcessInfo.RedirectStandardInput = $true
    $aivenProcessInfo.RedirectStandardOutput = $true
    $aivenProcessInfo.RedirectStandardError = $true
    if ($aivenProcessInfo.PSObject.Properties.Name -contains 'StandardInputEncoding') {
        $aivenProcessInfo.StandardInputEncoding = [Text.UTF8Encoding]::new($false)
    }
    $aivenProcessInfo.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $aivenProcessInfo.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
    $aivenProcess = [Diagnostics.Process]::Start($aivenProcessInfo)
    try {
        $aivenOutput = $aivenProcess.StandardOutput.ReadToEndAsync()
        $aivenError = $aivenProcess.StandardError.ReadToEndAsync()
        $aivenProcess.StandardInput.Write($InputJson)
        $aivenProcess.StandardInput.Close()
        $aivenProcess.WaitForExit()
        if ($aivenProcess.ExitCode -ne 0) {
            try { $aivenDiagnostic = $aivenError.Result.Trim() | ConvertFrom-Json } catch { $aivenDiagnostic = $null }
            if ($aivenDiagnostic.error.code) {
                throw "Aiven: etapa=$($aivenDiagnostic.error.stage); codigo=$($aivenDiagnostic.error.code); errno=$($aivenDiagnostic.error.errno); SQLSTATE=$($aivenDiagnostic.error.sqlState). $($aivenDiagnostic.error.message) Relatorio privado: backups/aiven-recovery/latest.json"
            }
            $aivenCode = if ($aivenError.Result -match 'MODULE_NOT_FOUND') { 'MODULE_NOT_FOUND' } else { 'NODE_START_FAILED' }
            throw "Aiven: etapa=launcher; codigo=$aivenCode; exit=$($aivenProcess.ExitCode). Nenhum stderr bruto ou segredo foi registrado."
        }
        Write-Output $aivenOutput.Result.Trim()
    } finally { $aivenProcess.Dispose() }
}

# Dot-sourcing exposes the launcher for its noninteractive regression test only.
if ($MyInvocation.InvocationName -eq '.') { return }
$aivenProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $aivenProjectRoot
$aivenHost = Read-Host 'Host do servico MySQL Free (console Aiven)'
if ($aivenHost -notmatch '\.aivencloud\.com$') { throw 'Use o endpoint oficial do servico Aiven aprovado.' }
$aivenPort = Read-Host 'Porta MySQL informada pela Aiven'
$aivenUser = Read-Host 'Usuario administrador Aiven (normalmente avnadmin)'
$aivenCaPath = Read-Host 'Caminho absoluto do certificado CA baixado da Aiven'
# PowerShell 5.1 serializes Get-Content's ETS properties as an object, not a PEM string.
$aivenCa = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $aivenCaPath).ProviderPath)
$aivenSecret = Read-Host 'Senha administrativa Aiven (nao sera exibida)' -AsSecureString
$aivenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($aivenSecret)
try {
    $aivenInput = @{ DB_HOST=$aivenHost; DB_PORT=$aivenPort; DB_USER=$aivenUser;
        DB_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($aivenPointer);
        DB_NAME='defaultdb'; DB_SSL='true'; DB_SSL_CA=$aivenCa } | ConvertTo-Json -Compress
    Invoke-AivenBootstrap -ProjectRoot $aivenProjectRoot -InputJson $aivenInput -InspectOnly:$InspectOnly
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($aivenPointer)
    $aivenInput = $null
    $aivenSecret = $null
}
