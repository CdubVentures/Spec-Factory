param(
  [int]$ParentPid,
  [string]$RootDir,
  [string]$ExePath
)
$ErrorActionPreference = 'Stop'
$logPath = Join-Path $RootDir 'tools\dist\auto-rebuild.log'
"[$(Get-Date -Format o)] Auto rebuild requested." | Out-File -FilePath $logPath -Encoding utf8
while (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 300 }
Set-Location -LiteralPath $RootDir
"[$(Get-Date -Format o)] Running node tools/build-exe.mjs" | Add-Content -Path $logPath
& node tools/build-exe.mjs *>> $logPath
if ($LASTEXITCODE -ne 0) {
  "[$(Get-Date -Format o)] Build failed with exit code $LASTEXITCODE" | Add-Content -Path $logPath
  try { Start-Process -FilePath 'notepad.exe' -ArgumentList @($logPath) } catch { }
  exit $LASTEXITCODE
}
"[$(Get-Date -Format o)] Build succeeded. Relaunching SpecFactory.exe" | Add-Content -Path $logPath
Start-Process -FilePath $ExePath -ArgumentList @('--skip-autorebuild')