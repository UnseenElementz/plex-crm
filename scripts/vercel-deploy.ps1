$ErrorActionPreference = 'Stop'
if (-not $env:VERCEL_TOKEN) { throw 'Set VERCEL_TOKEN environment variable' }
if (-not $env:VERCEL_PROJECT_ID) { throw 'Set VERCEL_PROJECT_ID environment variable' }
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { throw 'Node.js/npm required' }

if ($env:VERCEL_ORG_ID) { $scope = "--scope $env:VERCEL_ORG_ID" } else { $scope = '' }

cmd /c "npx vercel pull --yes --environment=production --token $env:VERCEL_TOKEN $scope"
if ($LASTEXITCODE -ne 0) { throw 'vercel pull failed' }
cmd /c "npx vercel build --prod --token $env:VERCEL_TOKEN $scope"
if ($LASTEXITCODE -ne 0) { throw 'vercel build failed' }
cmd /c "npx vercel deploy --prebuilt --prod --token $env:VERCEL_TOKEN $scope"
if ($LASTEXITCODE -ne 0) { throw 'vercel deploy failed' }
