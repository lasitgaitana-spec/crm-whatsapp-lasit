$connected = $false
$start = Get-Date
while ((New-TimeSpan -Start $start -End (Get-Date)).TotalSeconds -lt 300) {
  try { $r = Invoke-RestMethod -UseBasicParsing http://localhost:3000/api/wa/status } catch { $r = $null }
  $ts = Get-Date -Format o
  if ($r) { Write-Host "$ts status=$($r.status)" } else { Write-Host "$ts status=error" }
  if (-not $connected -and $r -and $r.status -eq 'connected') {
    $connected = $true
    Write-Host "$ts connected; monitoring 90s..."
    for ($i = 0; $i -lt 7; $i++) {
      Start-Sleep -Seconds 13
      try { $r2 = Invoke-RestMethod -UseBasicParsing http://localhost:3000/api/wa/status } catch { $r2 = $null }
      $ts2 = Get-Date -Format o
      if ($r2) { Write-Host "$ts2 status=$($r2.status)" } else { Write-Host "$ts2 status=error" }
    }
    break
  }
  Start-Sleep -Seconds 5
}
Write-Host "monitor finished"