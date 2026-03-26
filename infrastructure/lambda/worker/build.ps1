# Build script for AiVI Worker Lambda (Windows PowerShell)
# Run from infrastructure/lambda/worker directory

$ErrorActionPreference = "Stop"

Write-Host "Building AiVI Analyzer Worker Lambda..." -ForegroundColor Cyan

# Navigate to worker directory
Set-Location $PSScriptRoot

# Clean previous build
if (Test-Path worker.zip) { Remove-Item worker.zip -Force -ErrorAction SilentlyContinue }
if (Test-Path node_modules) { Remove-Item node_modules -Recurse -Force -ErrorAction SilentlyContinue }

# Install production dependencies only
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm ci --production

# Ensure checks definitions are bundled
$sharedSource = Join-Path $PSScriptRoot "..\shared\schemas\checks-definitions-v1.json"
$sharedTargetDir = Join-Path $PSScriptRoot "shared\schemas"
if (-not (Test-Path $sharedSource)) {
    Write-Host "Missing checks definitions at $sharedSource" -ForegroundColor Red
    exit 1
}
New-Item -ItemType Directory -Path $sharedTargetDir -Force | Out-Null
Copy-Item $sharedSource -Destination $sharedTargetDir -Force

# Ensure scoring config is bundled for server-side score computation
$scoringSource = Join-Path $PSScriptRoot "..\orchestrator\schemas\scoring-config-v1.json"
if (-not (Test-Path $scoringSource)) {
    Write-Host "Missing scoring config at $scoringSource" -ForegroundColor Red
    exit 1
}
Copy-Item $scoringSource -Destination $sharedTargetDir -Force

# Ensure shared runtime scoring modules are bundled
$sharedRuntimeTargetDir = Join-Path $PSScriptRoot "shared"
$sharedRuntimeFiles = @(
    "billing-account-state.js",
    "credit-ledger.js",
    "credit-pricing.js",
    "score-contract.js",
    "scoring-policy.js"
)
New-Item -ItemType Directory -Path $sharedRuntimeTargetDir -Force | Out-Null
foreach ($runtimeFile in $sharedRuntimeFiles) {
    $runtimeSource = Join-Path $PSScriptRoot "..\shared\$runtimeFile"
    if (-not (Test-Path $runtimeSource)) {
        Write-Host "Missing shared runtime file at $runtimeSource" -ForegroundColor Red
        exit 1
    }
    Copy-Item $runtimeSource -Destination (Join-Path $sharedRuntimeTargetDir $runtimeFile) -Force
}

# Create zip package (including schemas and prompts for 44-checks)
# C1 FIX: Added preflight-handler.js for deterministic checks
Write-Host "Creating deployment package..." -ForegroundColor Yellow
tar -acf worker.zip index.js analysis-serializer.js pii-scrubber.js preflight-handler.js package.json package-lock.json node_modules schemas prompts shared

# Report size
$zipInfo = Get-Item worker.zip
$sizeMB = [math]::Round($zipInfo.Length / 1MB, 2)
Write-Host "Build complete: worker.zip ($sizeMB MB)" -ForegroundColor Green

Write-Host ""
Write-Host "Ready for deployment. Run:" -ForegroundColor Cyan
Write-Host "   cd infrastructure/terraform; terraform apply"
