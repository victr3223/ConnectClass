param(
    [string]$NewManagerEmail = $env:NEW_MANAGER_EMAIL,
    [string]$OldManagerEmail = $env:OLD_MANAGER_EMAIL
)
$ErrorActionPreference = 'Stop'
if (-not $NewManagerEmail) { $NewManagerEmail = Read-Host 'E-mail do novo gestor' }
if (-not $OldManagerEmail) { $OldManagerEmail = Read-Host 'E-mail do gestor antigo' }
$managerSecret = Read-Host 'Senha do novo gestor (entrada oculta, 8 a 128 caracteres)' -AsSecureString
$managerSecretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($managerSecret)
$previousOutputEncoding = $OutputEncoding
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $managerPayload = @{
        NEW_MANAGER_EMAIL = $NewManagerEmail
        OLD_MANAGER_EMAIL = $OldManagerEmail
        NEW_MANAGER_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($managerSecretPointer)
    } | ConvertTo-Json -Compress
    $managerPayload | docker compose exec -T app node scripts/replace-manager.js --stdin-env
    if ($LASTEXITCODE -ne 0) { throw 'Troca não concluída. Preserve as contas e confira o estado.' }
} finally {
    $managerPayload = $null
    $OutputEncoding = $previousOutputEncoding
    Pop-Location
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($managerSecretPointer)
    $managerSecret.Dispose()
}
