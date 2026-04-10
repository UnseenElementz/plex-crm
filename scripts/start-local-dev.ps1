$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$port = 3000
$maxAttempts = 2

function Stop-ProjectDevProcesses {
  $listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($entry in $listening) {
    try {
      Stop-Process -Id $entry.OwningProcess -Force -ErrorAction Stop
    } catch {
    }
  }

  $projectTag = $projectRoot.ToLowerInvariant()
  $nodeProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
  foreach ($proc in $nodeProcesses) {
    $commandLine = [string]$proc.CommandLine
    if ($commandLine.ToLowerInvariant().Contains($projectTag) -and $commandLine.ToLowerInvariant().Contains('next')) {
      try {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
      } catch {
      }
    }
  }
}

function Remove-NextArtifacts {
  $nextPath = Join-Path $projectRoot '.next'
  if (Test-Path $nextPath) {
    Remove-Item -LiteralPath $nextPath -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Get-CssPathFromHtml {
  param(
    [string]$Html
  )

  $match = [regex]::Match($Html, '/_next/static/css/app/layout\.css[^"\''< ]*')
  if ($match.Success) {
    return $match.Value
  }

  return $null
}

function Start-NextDev {
  param(
    [string]$LogPath
  )

  return Start-Process `
    -FilePath 'powershell.exe' `
    -ArgumentList @(
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      "Set-Location '$projectRoot'; npm.cmd run dev:next *>> '$LogPath'"
    ) `
    -PassThru `
    -WindowStyle Hidden
}

function Ensure-DevWatchdog {
  $watchScript = Join-Path $PSScriptRoot 'watch-local-dev.ps1'
  if (-not (Test-Path $watchScript)) {
    return
  }

  $watchTag = $watchScript.ToLowerInvariant()
  $projectTag = $projectRoot.ToLowerInvariant()
  $watchers = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $commandLine = [string]$_.CommandLine
    $commandLine.ToLowerInvariant().Contains($watchTag) -and $commandLine.ToLowerInvariant().Contains($projectTag)
  }

  if ($watchers) {
    return
  }

  Start-Process `
    -FilePath 'powershell.exe' `
    -ArgumentList @(
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', $watchScript,
      '-ProjectRoot', $projectRoot
    ) `
    -WindowStyle Hidden | Out-Null
}

function Wait-ForHealthyDevServer {
  param(
    [System.Diagnostics.Process]$Process,
    [string]$LogPath
  )

  for ($i = 0; $i -lt 60; $i++) {
    if ($Process.HasExited) {
      throw "Dev server exited early. Check $LogPath"
    }

    try {
      $html = Invoke-WebRequest -Uri "http://localhost:$port/admin/dashboard" -UseBasicParsing -TimeoutSec 5
      $cssPath = Get-CssPathFromHtml -Html $html.Content
      if ($html.StatusCode -eq 200 -and $cssPath) {
        $css = Invoke-WebRequest -Uri "http://localhost:$port$cssPath" -UseBasicParsing -TimeoutSec 5
        if ($css.StatusCode -eq 200) {
          return
        }
      }
    } catch {
    }

    Start-Sleep -Seconds 1
  }

  throw "Dev server did not become healthy in time. Check $LogPath"
}

for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
  Stop-ProjectDevProcesses
  Start-Sleep -Milliseconds 750
  Remove-NextArtifacts

  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $logPath = Join-Path $projectRoot "local-dev-$timestamp.log"
  $process = Start-NextDev -LogPath $logPath

  try {
    Wait-ForHealthyDevServer -Process $process -LogPath $logPath
    Ensure-DevWatchdog
    Write-Output "Local dev ready on http://localhost:$port"
    Write-Output "Log: $logPath"
    exit 0
  } catch {
    try {
      if (-not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction Stop
      }
    } catch {
    }

    if ($attempt -eq $maxAttempts) {
      Write-Error $_
      exit 1
    }
  }
}
