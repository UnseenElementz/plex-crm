param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$port = 3000
$pollSeconds = 6
$startupWaitSeconds = 60

function Stop-ProjectDevProcesses {
  $listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($entry in $listening) {
    try {
      Stop-Process -Id $entry.OwningProcess -Force -ErrorAction Stop
    } catch {
    }
  }

  $projectTag = $ProjectRoot.ToLowerInvariant()
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
  $nextPath = Join-Path $ProjectRoot '.next'
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

function Get-LatestLogPath {
  $logs = Get-ChildItem -Path $ProjectRoot -Filter 'local-dev-*.log' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
  if ($logs) {
    return $logs[0].FullName
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
      "Set-Location '$ProjectRoot'; npm.cmd run dev:next *>> '$LogPath'"
    ) `
    -PassThru `
    -WindowStyle Hidden
}

function Test-DevHealth {
  try {
    $html = Invoke-WebRequest -Uri "http://localhost:$port/admin/dashboard" -UseBasicParsing -TimeoutSec 5
    if ($html.StatusCode -ne 200) {
      return $false
    }

    $cssPath = Get-CssPathFromHtml -Html $html.Content
    if (-not $cssPath) {
      return $false
    }

    $css = Invoke-WebRequest -Uri "http://localhost:$port$cssPath" -UseBasicParsing -TimeoutSec 5
    return $css.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Test-LogForRuntimeCrash {
  $logPath = Get-LatestLogPath
  if (-not $logPath -or -not (Test-Path $logPath)) {
    return $false
  }

  $tail = Get-Content $logPath -Tail 120 -ErrorAction SilentlyContinue | Out-String
  return (
    $tail -match '__webpack_modules__\[moduleId\] is not a function' -or
    $tail -match 'GET /_next/static/.+ 404'
  )
}

function Restart-DevServer {
  Stop-ProjectDevProcesses
  Start-Sleep -Milliseconds 750
  Remove-NextArtifacts

  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $logPath = Join-Path $ProjectRoot "local-dev-$timestamp.log"
  $process = Start-NextDev -LogPath $logPath

  for ($i = 0; $i -lt $startupWaitSeconds; $i++) {
    if ($process.HasExited) {
      break
    }
    if (Test-DevHealth) {
      return
    }
    Start-Sleep -Seconds 1
  }
}

while ($true) {
  Start-Sleep -Seconds $pollSeconds

  $healthy = Test-DevHealth
  if ($healthy) {
    continue
  }

  $crashed = Test-LogForRuntimeCrash
  if (-not $crashed) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
      continue
    }
  }

  Restart-DevServer
}
