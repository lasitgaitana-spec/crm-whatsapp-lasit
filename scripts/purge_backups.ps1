Param(
  [string]$BackupsDir = "backups"
)

$ErrorActionPreference = 'Stop'
try {
  if (-not (Test-Path $BackupsDir)) { Write-Host "[Purge] Carpeta '$BackupsDir' no existe."; exit 0 }
  $items = Get-ChildItem -Path $BackupsDir
  $dirs = $items | Where-Object { $_.PSIsContainer -and $_.Name -match '^[0-9]{8}_[0-9]{6}$' } | Sort-Object Name
  $zips = $items | Where-Object { -not $_.PSIsContainer -and $_.Name -match '^[0-9]{8}_[0-9]{6}\.zip$' } | Sort-Object Name
  if (($dirs.Count -eq 0) -and ($zips.Count -eq 0)) { Write-Host "[Purge] No hay respaldos"; exit 0 }
  if ($dirs.Count -gt 0) { $latestStamp = $dirs[$dirs.Count-1].Name } else { $latestStamp = ($zips[$zips.Count-1].Name -replace '\.zip$','') }
  Write-Host "[Purge] Conservando: $latestStamp"
  $keep = @($latestStamp, ("$latestStamp.zip"))
  $items | Where-Object { $keep -notcontains $_.Name } | ForEach-Object {
    Write-Host "[Purge] Eliminando $($_.FullName)"
    Remove-Item -Recurse -Force -Path $_.FullName
  }
  Write-Host "[Purge] Completado"
} catch {
  Write-Error "[Purge] Error: $($_.Exception.Message)"
  exit 1
}