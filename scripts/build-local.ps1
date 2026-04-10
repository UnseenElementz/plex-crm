param()

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $projectRoot "build-$timestamp.log"
$errorLogPath = Join-Path $projectRoot "build-$timestamp.err.log"
$localDistDir = '.next-build-local'
$localDistPath = Join-Path $projectRoot $localDistDir
$nextCliPath = '.\node_modules\next\dist\bin\next'

if (Test-Path $localDistPath) {
  Remove-Item -LiteralPath $localDistPath -Recurse -Force
}

$env:NEXT_DIST_DIR = $localDistDir

Write-Output "Starting local build..."
Write-Output "Log: $logPath"
Write-Output "Build output: $localDistPath"

$process = New-Object System.Diagnostics.Process
$process.StartInfo.FileName = 'node.exe'
$process.StartInfo.WorkingDirectory = $projectRoot
$process.StartInfo.Arguments = "`"$nextCliPath`" build"
$process.StartInfo.UseShellExecute = $false
$process.StartInfo.RedirectStandardOutput = $true
$process.StartInfo.RedirectStandardError = $true
$process.StartInfo.CreateNoWindow = $true

$stdoutEvent = Register-ObjectEvent `
  -InputObject $process `
  -EventName OutputDataReceived `
  -MessageData $logPath `
  -Action {
    if ($EventArgs.Data) {
      Add-Content -LiteralPath $Event.MessageData -Value $EventArgs.Data
    }
  }

$stderrEvent = Register-ObjectEvent `
  -InputObject $process `
  -EventName ErrorDataReceived `
  -MessageData $errorLogPath `
  -Action {
    if ($EventArgs.Data) {
      Add-Content -LiteralPath $Event.MessageData -Value $EventArgs.Data
    }
  }

$null = $process.Start()
$process.BeginOutputReadLine()
$process.BeginErrorReadLine()

$lastSize = 0
$lastErrorSize = 0
$lastLines = @()
$startedAt = Get-Date

while (-not $process.HasExited) {
  Start-Sleep -Seconds 3

  $elapsed = [int]((Get-Date) - $startedAt).TotalSeconds
  Write-Output "Build still running... ${elapsed}s elapsed"

  if (Test-Path $logPath) {
    $file = Get-Item $logPath -ErrorAction SilentlyContinue
    if ($file -and $file.Length -ne $lastSize) {
      $lastSize = $file.Length
      $lastLines = Get-Content $logPath -Tail 12 -ErrorAction SilentlyContinue
      if ($lastLines) {
        Write-Output ($lastLines -join [Environment]::NewLine)
      }
    }
  }

  if (Test-Path $errorLogPath) {
    $errorFile = Get-Item $errorLogPath -ErrorAction SilentlyContinue
    if ($errorFile -and $errorFile.Length -ne $lastErrorSize) {
      $lastErrorSize = $errorFile.Length
      $errorLines = Get-Content $errorLogPath -Tail 12 -ErrorAction SilentlyContinue
      if ($errorLines) {
        Write-Output ($errorLines -join [Environment]::NewLine)
      }
    }
  }
}

$process.WaitForExit()
$process.CancelOutputRead()
$process.CancelErrorRead()
$exitCode = $process.ExitCode

if (Test-Path $logPath) {
  $lastLines = Get-Content $logPath -Tail 20 -ErrorAction SilentlyContinue
}

if ($lastLines) {
  Write-Output ($lastLines -join [Environment]::NewLine)
}

if (Test-Path $errorLogPath) {
  $errorLines = Get-Content $errorLogPath -Tail 20 -ErrorAction SilentlyContinue
  if ($errorLines) {
    Write-Output ($errorLines -join [Environment]::NewLine)
  }
}

if ($exitCode -ne 0) {
  Write-Error "Build failed. Check $logPath and $errorLogPath"
  Unregister-Event -SubscriptionId $stdoutEvent.Id -ErrorAction SilentlyContinue
  Unregister-Event -SubscriptionId $stderrEvent.Id -ErrorAction SilentlyContinue
  exit $exitCode
}

Unregister-Event -SubscriptionId $stdoutEvent.Id -ErrorAction SilentlyContinue
Unregister-Event -SubscriptionId $stderrEvent.Id -ErrorAction SilentlyContinue
Write-Output "Build completed successfully."
Write-Output "Log: $logPath"
