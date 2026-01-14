param(
  [string]$Destination = "backups",
  [switch]$Zip,
  [int]$RetentionDays = 0
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$destRoot = Join-Path $root $Destination
$backupDir = Join-Path $destRoot $timestamp

Write-Host "[Backup] Root: $root" -ForegroundColor Cyan
Write-Host "[Backup] Destino: $backupDir" -ForegroundColor Cyan

try {
  if (-not (Test-Path $destRoot)) { New-Item -ItemType Directory -Path $destRoot | Out-Null }
  if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

  $waAuthSrc = Join-Path $root "server\wa_auth"
  $storageSrc = Join-Path $root "server\storage"
  $serverEnv = Join-Path $root "server\.env"
  $serverIndex = Join-Path $root "server\index.js"
  $frontendTx = Join-Path $root "frontend\src\pages\Transmission.jsx" # legado (si existe)
  # Nuevos: respalda explícitamente la lógica del agente en el frontend
  $agentsCreate = Join-Path $root "frontend\src\pages\AgentsCreate.jsx"
  $superAssign = Join-Path $root "frontend\src\pages\SuperAgentAssign.jsx"
  $settingsGemini = Join-Path $root "frontend\src\pages\SettingsGeminiSuperAgent.jsx"
  $agentsListPage = Join-Path $root "frontend\src\pages\Agents.jsx"
  $explicacionJson = Join-Path $root "Explicacion.json"

  if (Test-Path $waAuthSrc) {
    $waAuthDst = Join-Path $backupDir "wa_auth"
    Write-Host "[Backup] Copiando wa_auth -> $waAuthDst" -ForegroundColor Green
    Copy-Item -Path $waAuthSrc -Destination $waAuthDst -Recurse -Force
  } else {
    Write-Warning "[Backup] Carpeta wa_auth no encontrada en $waAuthSrc"
  }

  if (Test-Path $storageSrc) {
    $storageDst = Join-Path $backupDir "storage"
    Write-Host "[Backup] Copiando storage -> $storageDst" -ForegroundColor Green
    Copy-Item -Path $storageSrc -Destination $storageDst -Recurse -Force
  } else {
    Write-Warning "[Backup] Carpeta storage no encontrada en $storageSrc"
  }

  # Copiar configuración y archivos clave del código para snapshot rápido
  $cfgDst = Join-Path $backupDir "config_code"
  if (-not (Test-Path $cfgDst)) { New-Item -ItemType Directory -Path $cfgDst | Out-Null }
  if (Test-Path $serverEnv) {
    Write-Host "[Backup] Copiando server/.env -> $cfgDst" -ForegroundColor Green
    Copy-Item -Path $serverEnv -Destination $cfgDst -Force
  }
  if (Test-Path $serverIndex) {
    Write-Host "[Backup] Copiando server/index.js -> $cfgDst" -ForegroundColor Green
    Copy-Item -Path $serverIndex -Destination $cfgDst -Force
  }
  if (Test-Path $frontendTx) {
    Write-Host "[Backup] Copiando frontend Transmission.jsx -> $cfgDst" -ForegroundColor Green
    Copy-Item -Path $frontendTx -Destination $cfgDst -Force
  }

  # Copiar archivos clave del frontend (lógica del agente)
  $pagesDst = Join-Path $cfgDst "frontend_pages"
  if (-not (Test-Path $pagesDst)) { New-Item -ItemType Directory -Path $pagesDst | Out-Null }
  $toCopy = @($agentsCreate, $superAssign, $settingsGemini, $agentsListPage, $explicacionJson)
  foreach ($p in $toCopy) {
    if (Test-Path $p) {
      Write-Host "[Backup] Copiando $([System.IO.Path]::GetFileName($p)) -> $pagesDst" -ForegroundColor Green
      Copy-Item -Path $p -Destination $pagesDst -Force
    }
  }

  if ($Zip.IsPresent) {
    $zipPath = Join-Path $destRoot ("{0}.zip" -f $timestamp)
    Write-Host "[Backup] Comprimiendo a $zipPath" -ForegroundColor Yellow
    Compress-Archive -Path (Join-Path $backupDir '*') -DestinationPath $zipPath -Force
  }

  if ($RetentionDays -gt 0) {
    $threshold = (Get-Date).AddDays(-$RetentionDays)
    Write-Host "[Backup] Purga de respaldos anteriores a $threshold" -ForegroundColor Magenta
    Get-ChildItem -Path $destRoot -Directory |
      Where-Object { $_.Name -match '^\d{8}_\d{6}$' -and $_.LastWriteTime -lt $threshold } |
      ForEach-Object {
        Write-Host "[Backup] Eliminando $_" -ForegroundColor DarkYellow
        Remove-Item -Path $_.FullName -Recurse -Force
      }
  }

  Write-Host "[Backup] Completado en $backupDir" -ForegroundColor Cyan
} catch {
  Write-Error "[Backup] Error: $($_.Exception.Message)"
  exit 1
}