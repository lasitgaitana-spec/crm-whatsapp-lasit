param(
  [string]$Destination = "backups",
  [switch]$Zip
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$destRoot = Join-Path $root $Destination
$backupDir = Join-Path $destRoot "full_$timestamp"

Write-Host "[FullBackup] Root: $root" -ForegroundColor Cyan
Write-Host "[FullBackup] Destination: $backupDir" -ForegroundColor Cyan

try {
  if (-not (Test-Path $destRoot)) { New-Item -ItemType Directory -Path $destRoot | Out-Null }
  if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

  # Use Robocopy for efficient mirroring with exclusions
  # /E :: copy subdirectories, including Empty ones.
  # /XD :: eXclude Directories matching given names/paths.
  # /XF :: eXclude Files matching given names/paths.
  # /R:0 /W:0 :: 0 retries, 0 wait (fail fast on locked files)
  # /NFL /NDL :: No File List, No Directory List (less output noise)
  
  $robocopyArgs = @(
    $root,
    $backupDir,
    "/E",
    "/XD", 
      "node_modules", 
      ".git", 
      "backups", 
      ".wwebjs_cache", 
      "mysql_data", 
      "dist", 
      "build",
      ".vscode",
      ".idea",
    "/XF", 
      "*.log", 
      "*.tmp",
      "*.lock",
      ".DS_Store",
    "/R:1", 
    "/W:1"
  )
  
  Write-Host "[FullBackup] Copying files (excluding node_modules, .git, etc)..." -ForegroundColor Green
  
  # Run robocopy using call operator (handles spaces in paths better than Start-Process ArgumentList)
  & robocopy $robocopyArgs | Out-Null
  
  # Robocopy exit codes:
  # 0: No errors occurred, and no copying was done.
  # 1: One or more files were copied successfully (that is, new files have arrived).
  # 2: Some Extra files or directories were detected.
  # 4: Some Mismatched files or directories were detected.
  # 8: Some files or directories could not be copied (Copy errors occurred) and the retry limit was exceeded.
  # 16: Serious error. Robocopy did not copy any files.
  
  if ($LASTEXITCODE -ge 8) {
    Write-Warning "[FullBackup] Robocopy finished with issues (Exit Code: $LASTEXITCODE). Some files might be missing."
  } else {
    Write-Host "[FullBackup] File copy completed successfully." -ForegroundColor Green
  }

  if ($Zip.IsPresent) {
    $zipPath = Join-Path $destRoot ("full_{0}.zip" -f $timestamp)
    Write-Host "[FullBackup] Compressing to $zipPath ..." -ForegroundColor Yellow
    
    # Compress-Archive can be slow for large folders, but it's built-in.
    Compress-Archive -Path (Join-Path $backupDir '*') -DestinationPath $zipPath -Force
    Write-Host "[FullBackup] Compression finished." -ForegroundColor Green
  }
  
  Write-Host "[FullBackup] Backup created at: $backupDir" -ForegroundColor Cyan
} catch {
  Write-Error "[FullBackup] Critical Error: $($_.Exception.Message)"
  exit 1
}