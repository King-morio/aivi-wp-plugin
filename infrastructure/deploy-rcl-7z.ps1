# Deploy Result Contract Lock using 7za for long path support.
# Hardened to avoid packaging drift across worker/orchestrator.
$ErrorActionPreference = "Stop"

Write-Host "============================================"
Write-Host "DEPLOYING RESULT CONTRACT LOCK"
Write-Host "============================================"

# AiVI deployments must use the default AWS credential chain only.
if (Test-Path Env:AWS_PROFILE) {
    Write-Host "Clearing AWS_PROFILE for AiVI deploy"
    Remove-Item Env:AWS_PROFILE -ErrorAction SilentlyContinue
}
if (Test-Path Env:AWS_DEFAULT_PROFILE) {
    Write-Host "Clearing AWS_DEFAULT_PROFILE for AiVI deploy"
    Remove-Item Env:AWS_DEFAULT_PROFILE -ErrorAction SilentlyContinue
}

$sevenZip = Join-Path $PSScriptRoot "lambda\worker_temp\7za.exe"
$orchestratorFunction = "aivi-orchestrator-run-dev"
$workerFunction = "aivi-analyzer-worker-dev"
$region = "eu-north-1"

if (-not (Test-Path $sevenZip)) {
    throw "7za executable not found at $sevenZip"
}

function Resolve-FirstExistingPath {
    param(
        [string]$Name,
        [string[]]$Candidates
    )
    $path = $Candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $path) {
        $joined = ($Candidates -join ", ")
        throw "Missing required file [$Name]. Checked: $joined"
    }
    return $path
}

function Ensure-SharedDefinitions {
    param([string]$LambdaDir)
    $sharedDir = Join-Path $PSScriptRoot "lambda\shared\schemas"
    $orchestratorSchemaDir = Join-Path $PSScriptRoot "lambda\orchestrator\schemas"
    $targetDir = Join-Path $LambdaDir "shared\schemas"

    $schemaSpecs = @(
        @{
            name = "checks-definitions-v1.json"
            candidates = @(
                (Join-Path $sharedDir "checks-definitions-v1.json")
            )
        },
        @{
            name = "check-runtime-contract-v1.json"
            candidates = @(
                (Join-Path $sharedDir "check-runtime-contract-v1.json")
            )
        },
        @{
            name = "deterministic-explanations-v1.json"
            candidates = @(
                (Join-Path $sharedDir "deterministic-explanations-v1.json")
            )
        },
        @{
            name = "scoring-config-v1.json"
            candidates = @(
                (Join-Path $sharedDir "scoring-config-v1.json"),
                (Join-Path $orchestratorSchemaDir "scoring-config-v1.json")
            )
        }
    )

    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    foreach ($spec in $schemaSpecs) {
        $source = Resolve-FirstExistingPath -Name $spec.name -Candidates $spec.candidates
        Copy-Item $source -Destination (Join-Path $targetDir $spec.name) -Force
    }
}

function Assert-PathsExist {
    param(
        [string[]]$Paths,
        [string]$Label
    )
    $missing = @()
    foreach ($path in $Paths) {
        if (-not (Test-Path $path)) {
            $missing += $path
        }
    }
    if ($missing.Count -gt 0) {
        $missingText = ($missing -join ", ")
        throw "Missing required $Label paths: $missingText"
    }
}

function Get-ArchiveEntries {
    param([string]$ArchivePath)
    $output = & $sevenZip l -slt $ArchivePath
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to list archive contents for $ArchivePath"
    }
    $entries = @()
    foreach ($line in $output) {
        if ($line -match '^Path = (.+)$') {
            $entries += $Matches[1]
        }
    }
    return $entries
}

function Normalize-ArchivePath {
    param([string]$PathValue)
    return ($PathValue -replace '\\', '/').Trim().ToLowerInvariant()
}

function Assert-ArchiveContains {
    param(
        [string]$ArchivePath,
        [string[]]$RequiredEntries,
        [string]$Label
    )

    $archiveName = [System.IO.Path]::GetFileName($ArchivePath).ToLowerInvariant()
    $entries = Get-ArchiveEntries -ArchivePath $ArchivePath
    $normalizedEntries = $entries |
        Where-Object { $_ -and ([System.IO.Path]::GetFileName($_).ToLowerInvariant() -ne $archiveName) } |
        ForEach-Object { Normalize-ArchivePath $_ }

    $missing = @()
    foreach ($required in $RequiredEntries) {
        $candidate = Normalize-ArchivePath $required
        if (-not ($normalizedEntries -contains $candidate)) {
            $missing += $required
        }
    }

    if ($missing.Count -gt 0) {
        $missingText = ($missing -join ", ")
        throw "Archive $Label is missing required entries: $missingText"
    }
}

function Update-LambdaModelEnv {
    param(
        [Parameter(Mandatory = $true)][string]$FunctionName,
        [Parameter(Mandatory = $true)][string]$Region,
        [Parameter(Mandatory = $true)][string]$PrimaryModel,
        [Parameter(Mandatory = $true)][string]$FallbackModel
    )

    $config = aws --no-cli-pager lambda get-function-configuration `
        --function-name $FunctionName `
        --region $Region | ConvertFrom-Json

    $envVars = @{}
    if ($config.Environment -and $config.Environment.Variables) {
        $config.Environment.Variables.PSObject.Properties | ForEach-Object {
            $envVars[$_.Name] = [string]$_.Value
        }
    }

    $envVars['MISTRAL_MODEL'] = $PrimaryModel
    $envVars['MISTRAL_FALLBACK_MODEL'] = $FallbackModel
    $envVars['AI_COMPLETION_FIRST_ENABLED'] = 'true'
    $envVars['AI_SOFT_ANALYSIS_TARGET_MS'] = '90000'
    $envVars['AI_MAX_ANALYSIS_LATENCY_MS'] = '420000'
    $envVars['AI_LAMBDA_RESERVE_MS'] = '20000'

    $envSpec = @{ Variables = $envVars } | ConvertTo-Json -Compress -Depth 12
    $tmpEnvPath = Join-Path $env:TEMP ("lambda-env-" + [guid]::NewGuid().ToString() + ".json")
    try {
        [System.IO.File]::WriteAllText($tmpEnvPath, $envSpec, (New-Object System.Text.UTF8Encoding($false)))
        aws --no-cli-pager lambda update-function-configuration `
            --function-name $FunctionName `
            --region $Region `
            --environment "file://$tmpEnvPath" `
            --output json | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to update environment for $FunctionName"
        }
        aws lambda wait function-updated --function-name $FunctionName --region $Region
        if ($LASTEXITCODE -ne 0) {
            throw "Environment update did not complete for $FunctionName"
        }
    }
    finally {
        if (Test-Path $tmpEnvPath) {
            Remove-Item $tmpEnvPath -Force -ErrorAction SilentlyContinue
        }
    }
}

# STEP 1: Package Orchestrator
Write-Host ""
Write-Host "[1/4] Packaging Orchestrator Lambda..."

Set-Location (Join-Path $PSScriptRoot "lambda\orchestrator")
Ensure-SharedDefinitions -LambdaDir (Get-Location).Path

$orchestratorFiles = @(
    "index.js",
    "analysis-serializer.js",
    "analysis-details-handler.js",
    "run-status-handler.js",
    "sidebar-payload-stripper.js",
    "pii-scrubber.js",
    "telemetry-emitter.js",
    "analyze-run-handler.js",
    "analyze-run-async-handler.js",
    "apply-suggestion-handler.js",
    "preflight-handler.js",
    "prompt-manager.js",
    "rewrite-handler.js",
    "rewrite-target-resolver.js",
    "schema-draft-builder.js",
    "schema-validator.js",
    "scoring-engine.js",
    "token-counter.js",
    "package.json",
    "node_modules",
    "schemas",
    "shared\schemas\checks-definitions-v1.json",
    "shared\schemas\check-runtime-contract-v1.json",
    "shared\schemas\deterministic-explanations-v1.json",
    "shared\schemas\scoring-config-v1.json"
)

Assert-PathsExist -Paths $orchestratorFiles -Label "orchestrator"

Remove-Item -Path "..\orchestrator-rcl.zip" -Force -ErrorAction SilentlyContinue
& $sevenZip a -tzip "..\orchestrator-rcl.zip" $orchestratorFiles -mx=5 | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Failed to package orchestrator-rcl.zip"
}

Assert-ArchiveContains -ArchivePath "..\orchestrator-rcl.zip" -Label "orchestrator-rcl.zip" -RequiredEntries @(
    "index.js",
    "analysis-serializer.js",
    "schema-draft-builder.js",
    "shared/schemas/check-runtime-contract-v1.json",
    "shared/schemas/deterministic-explanations-v1.json",
    "shared/schemas/scoring-config-v1.json"
)

$orchSize = [math]::Round((Get-Item "..\orchestrator-rcl.zip").Length / 1MB, 2)
Write-Host "   OK Packaged orchestrator-rcl.zip - $orchSize MB"

# STEP 2: Package Worker
Write-Host ""
Write-Host "[2/4] Packaging Worker Lambda..."

Set-Location (Join-Path $PSScriptRoot "lambda\worker")
Ensure-SharedDefinitions -LambdaDir (Get-Location).Path

$workerFiles = @(
    "index.js",
    "analysis-serializer.js",
    "schema-draft-builder.js",
    "preflight-handler.js",
    "pii-scrubber.js",
    "package.json",
    "node_modules",
    "schemas",
    "prompts",
    "shared\schemas\checks-definitions-v1.json",
    "shared\schemas\check-runtime-contract-v1.json",
    "shared\schemas\deterministic-explanations-v1.json",
    "shared\schemas\scoring-config-v1.json"
)

Assert-PathsExist -Paths $workerFiles -Label "worker"

Remove-Item -Path "..\worker-rcl.zip" -Force -ErrorAction SilentlyContinue
& $sevenZip a -tzip "..\worker-rcl.zip" $workerFiles -mx=5 | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Failed to package worker-rcl.zip"
}

Assert-ArchiveContains -ArchivePath "..\worker-rcl.zip" -Label "worker-rcl.zip" -RequiredEntries @(
    "index.js",
    "analysis-serializer.js",
    "schema-draft-builder.js",
    "shared/schemas/check-runtime-contract-v1.json",
    "shared/schemas/deterministic-explanations-v1.json",
    "shared/schemas/scoring-config-v1.json"
)

$workerSize = [math]::Round((Get-Item "..\worker-rcl.zip").Length / 1MB, 2)
Write-Host "   OK Packaged worker-rcl.zip - $workerSize MB"

# STEP 3: Deploy Orchestrator
Write-Host ""
Write-Host "[3/4] Deploying Orchestrator to AWS..."

Set-Location (Join-Path $PSScriptRoot "lambda")
$result = aws lambda update-function-code --function-name $orchestratorFunction --zip-file "fileb://orchestrator-rcl.zip" --region $region --output json 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Failed to deploy orchestrator: $result"
}
Write-Host "   OK Orchestrator uploaded"

Write-Host "   Waiting for update..."
aws lambda wait function-updated --function-name $orchestratorFunction --region $region
Write-Host "   OK Orchestrator ready"

# STEP 4: Deploy Worker
Write-Host ""
Write-Host "[4/4] Deploying Worker to AWS..."

$result = aws lambda update-function-code --function-name $workerFunction --zip-file "fileb://worker-rcl.zip" --region $region --output json 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Failed to deploy worker: $result"
}
Write-Host "   OK Worker uploaded"

Write-Host "   Waiting for update..."
aws lambda wait function-updated --function-name $workerFunction --region $region
Write-Host "   OK Worker ready"

Write-Host ""
Write-Host "Pinning model environment on orchestrator + worker..."
Update-LambdaModelEnv -FunctionName $orchestratorFunction -Region $region -PrimaryModel 'mistral-large-latest' -FallbackModel 'magistral-small-latest'
Update-LambdaModelEnv -FunctionName $workerFunction -Region $region -PrimaryModel 'mistral-large-latest' -FallbackModel 'magistral-small-latest'
Write-Host "   OK Model environment pinned"

# SUMMARY
Write-Host ""
Write-Host "============================================"
Write-Host "DEPLOYMENT COMPLETE"
Write-Host "============================================"
Write-Host "Orchestrator: $orchSize MB"
Write-Host "Worker: $workerSize MB"

Set-Location $PSScriptRoot
