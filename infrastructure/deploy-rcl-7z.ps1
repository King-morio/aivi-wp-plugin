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

$sevenZipCandidates = @(
    (Join-Path $PSScriptRoot "lambda\worker_temp\7za.exe"),
    (Join-Path $PSScriptRoot "lambda\worker_temp\7z.exe")
)
$sevenZip = $sevenZipCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$tarExe = (Get-Command tar.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1)
$archiveTool = if ($sevenZip) { '7zip' } elseif ($tarExe) { 'tar' } else { 'dotnet' }
$orchestratorFunction = "aivi-orchestrator-run-dev"
$workerFunction = "aivi-analyzer-worker-dev"
$region = "eu-north-1"
$httpApiId = "dnvo4w1sca"

if ($archiveTool -eq 'tar') {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    Write-Host "7za executable not found. Falling back to tar.exe zip packaging."
}
elseif ($archiveTool -eq 'dotnet') {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    Write-Host "7za executable not found. Falling back to .NET zip packaging."
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
        },
        @{
            name = "fix-assist-contract-v1.json"
            candidates = @(
                (Join-Path $sharedDir "fix-assist-contract-v1.json"),
                (Join-Path $orchestratorSchemaDir "fix-assist-contract-v1.json")
            )
        }
    )

    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    foreach ($spec in $schemaSpecs) {
        $source = Resolve-FirstExistingPath -Name $spec.name -Candidates $spec.candidates
        Copy-Item $source -Destination (Join-Path $targetDir $spec.name) -Force
    }
}

function Ensure-SharedRuntime {
    param([string]$LambdaDir)
    $sharedDir = Join-Path $PSScriptRoot "lambda\shared"
    $targetDir = Join-Path $LambdaDir "shared"

    $runtimeFiles = @(
        "billing-account-state.js",
        "credit-ledger.js",
        "credit-pricing.js",
        "score-contract.js",
        "scoring-policy.js"
    )

    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    foreach ($runtimeFile in $runtimeFiles) {
        $source = Join-Path $sharedDir $runtimeFile
        if (-not (Test-Path $source)) {
            throw "Missing shared runtime file: $source"
        }
        Copy-Item $source -Destination (Join-Path $targetDir $runtimeFile) -Force
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
    if ($archiveTool -ne '7zip') {
        $zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $ArchivePath))
        try {
            return $zip.Entries | ForEach-Object { $_.FullName }
        }
        finally {
            $zip.Dispose()
        }
    }
    else {
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
}

function Write-ZipArchive {
    param(
        [Parameter(Mandatory = $true)][string]$ArchivePath,
        [Parameter(Mandatory = $true)][string[]]$Paths
    )

    $resolvedArchivePath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $ArchivePath))
    if (Test-Path $resolvedArchivePath) {
        Remove-Item $resolvedArchivePath -Force
    }

    if ($archiveTool -eq '7zip') {
        & $sevenZip a -tzip $resolvedArchivePath $Paths -mx=5 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to package $resolvedArchivePath"
        }
        return
    }

    if ($archiveTool -eq 'tar') {
        & $tarExe -a -cf $resolvedArchivePath @Paths
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to package $resolvedArchivePath via tar.exe"
        }
        return
    }

    $currentDir = (Get-Location).Path
    $zip = [System.IO.Compression.ZipFile]::Open($resolvedArchivePath, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($path in $Paths) {
            $resolvedPath = [System.IO.Path]::GetFullPath((Join-Path $currentDir $path))
            if (-not (Test-Path $resolvedPath)) {
                throw "Missing path during packaging: $resolvedPath"
            }

            if ((Get-Item $resolvedPath) -is [System.IO.DirectoryInfo]) {
                Get-ChildItem -Path $resolvedPath -Recurse -File | ForEach-Object {
                    $relativePath = (Get-RelativeArchivePath -BasePath $currentDir -TargetPath $_.FullName) -replace '\\', '/'
                    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $relativePath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
                }
            }
            else {
                $relativePath = (Get-RelativeArchivePath -BasePath $currentDir -TargetPath $resolvedPath) -replace '\\', '/'
                [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $resolvedPath, $relativePath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
            }
        }
    }
    finally {
        $zip.Dispose()
    }
}

function Normalize-ArchivePath {
    param([string]$PathValue)
    return ($PathValue -replace '\\', '/').Trim().ToLowerInvariant()
}

function Get-RelativeArchivePath {
    param(
        [Parameter(Mandatory = $true)][string]$BasePath,
        [Parameter(Mandatory = $true)][string]$TargetPath
    )

    $base = [System.IO.Path]::GetFullPath($BasePath)
    if (-not $base.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
        $base += [System.IO.Path]::DirectorySeparatorChar
    }
    $target = [System.IO.Path]::GetFullPath($TargetPath)
    $baseUri = New-Object System.Uri($base)
    $targetUri = New-Object System.Uri($target)
    return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString())
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
    $envVars['AI_CHECK_CHUNK_SIZE'] = '5'
    $envVars['AI_CHUNK_MAX_TOKENS'] = '1300'
    $envVars['AI_CHUNK_RETRY_MAX_TOKENS'] = '1700'
    $envVars['AI_SOFT_ANALYSIS_TARGET_MS'] = '90000'
    $envVars['AI_MAX_ANALYSIS_LATENCY_MS'] = '420000'
    $envVars['AI_LAMBDA_RESERVE_MS'] = '20000'
    $envVars['ACCOUNT_BILLING_STATE_TABLE'] = 'aivi-account-billing-state-dev'
    $envVars['CREDIT_LEDGER_TABLE'] = 'aivi-credit-ledger-dev'
    $envVars['BILLING_CHECKOUT_INTENTS_TABLE'] = 'aivi-billing-checkout-intents-dev'
    $envVars['PAYPAL_WEBHOOK_EVENTS_TABLE'] = 'aivi-paypal-webhook-events-dev'
    $envVars['BILLING_SUBSCRIPTIONS_TABLE'] = 'aivi-billing-subscriptions-dev'
    $envVars['BILLING_TOPUP_ORDERS_TABLE'] = 'aivi-billing-topup-orders-dev'
    $envVars['ADMIN_AUDIT_LOG_TABLE'] = 'aivi-admin-audit-log-dev'
    $envVars['AIVI_ADMIN_REQUIRE_MFA'] = 'true'
    $envVars['AIVI_ADMIN_ALLOW_BOOTSTRAP_TOKEN'] = 'false'

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

function Ensure-HttpApiRoute {
    param(
        [Parameter(Mandatory = $true)][string]$ApiId,
        [Parameter(Mandatory = $true)][string]$Region,
        [Parameter(Mandatory = $true)][string]$RouteKey,
        [Parameter(Mandatory = $false)][string]$AuthorizationType = "NONE",
        [Parameter(Mandatory = $false)][string]$SeedRouteKey = "GET /ping"
    )

    $routesJson = aws --no-cli-pager apigatewayv2 get-routes `
        --api-id $ApiId `
        --region $Region `
        --output json
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to fetch HTTP API routes for $ApiId"
    }

    $routes = ($routesJson | ConvertFrom-Json).Items
    $seedRoute = $routes | Where-Object { $_.RouteKey -eq $SeedRouteKey } | Select-Object -First 1
    if (-not $seedRoute -or -not $seedRoute.Target) {
        throw "Missing seed route [$SeedRouteKey] on API [$ApiId]; cannot infer integration target."
    }
    if ($AuthorizationType -eq "JWT" -and -not $seedRoute.AuthorizerId) {
        throw "Missing authorizer on seed route [$SeedRouteKey] for JWT route [$RouteKey] on API [$ApiId]."
    }

    $existingRoute = $routes | Where-Object { $_.RouteKey -eq $RouteKey } | Select-Object -First 1
    if (-not $existingRoute) {
        $createArgs = @(
            "apigatewayv2", "create-route",
            "--api-id", $ApiId,
            "--region", $Region,
            "--route-key", $RouteKey,
            "--target", $seedRoute.Target,
            "--authorization-type", $AuthorizationType,
            "--output", "json"
        )
        if ($AuthorizationType -eq "JWT") {
            $createArgs += @("--authorizer-id", $seedRoute.AuthorizerId)
        }
        aws --no-cli-pager @createArgs | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to create HTTP API route [$RouteKey] on [$ApiId]."
        }
        Write-Host "   OK Created missing route: $RouteKey"
        return
    }

    $requiresTargetUpdate = $existingRoute.Target -ne $seedRoute.Target
    $requiresAuthUpdate = $existingRoute.AuthorizationType -ne $AuthorizationType
    $requiresAuthorizerUpdate = $AuthorizationType -eq "JWT" -and $existingRoute.AuthorizerId -ne $seedRoute.AuthorizerId
    if (-not $requiresTargetUpdate -and -not $requiresAuthUpdate -and -not $requiresAuthorizerUpdate) {
        Write-Host "   OK Route present: $RouteKey"
        return
    }

    $updateArgs = @(
        "apigatewayv2", "update-route",
        "--api-id", $ApiId,
        "--route-id", $existingRoute.RouteId,
        "--region", $Region,
        "--authorization-type", $AuthorizationType,
        "--target", $seedRoute.Target,
        "--output", "json"
    )
    if ($AuthorizationType -eq "JWT") {
        $updateArgs += @("--authorizer-id", $seedRoute.AuthorizerId)
    }
    aws --no-cli-pager @updateArgs | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to update HTTP API route [$RouteKey] on [$ApiId]."
    }
    Write-Host "   OK Reconciled route: $RouteKey"
}

# STEP 1: Package Orchestrator
Write-Host ""
Write-Host "[1/4] Packaging Orchestrator Lambda..."

Set-Location (Join-Path $PSScriptRoot "lambda\orchestrator")
Ensure-SharedDefinitions -LambdaDir (Get-Location).Path
Ensure-SharedRuntime -LambdaDir (Get-Location).Path

$orchestratorFiles = @(
    "index.js",
    "account-onboarding-handler.js",
    "account-connect-handler.js",
    "account-summary-handler.js",
    "analysis-serializer.js",
    "analysis-details-handler.js",
    "billing-account-state.js",
    "billing-checkout-handler.js",
    "billing-store.js",
    "credit-ledger.js",
    "credit-pricing.js",
    "connection-token.js",
    "run-supersession.js",
    "run-status-handler.js",
    "paypal-client.js",
    "paypal-config.js",
    "paypal-reconciliation.js",
    "paypal-webhook-handler.js",
    "paypal-webhook-processing.js",
    "evidence-verifier.js",
    "fix-assist-contract-builder.js",
    "fix-assist-triage.js",
    "sidebar-payload-stripper.js",
    "pii-scrubber.js",
    "super-admin-audit-store.js",
    "super-admin-auth.js",
    "super-admin-diagnostics-handler.js",
    "super-admin-mutation-handler.js",
    "super-admin-read-handler.js",
    "super-admin-store.js",
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
    "shared\billing-account-state.js",
    "shared\credit-ledger.js",
    "shared\credit-pricing.js",
    "shared\score-contract.js",
    "shared\scoring-policy.js",
    "shared\schemas\checks-definitions-v1.json",
    "shared\schemas\check-runtime-contract-v1.json",
    "shared\schemas\deterministic-explanations-v1.json",
    "shared\schemas\fix-assist-contract-v1.json",
    "shared\schemas\scoring-config-v1.json"
)

Assert-PathsExist -Paths $orchestratorFiles -Label "orchestrator"

Remove-Item -Path "..\orchestrator-rcl.zip" -Force -ErrorAction SilentlyContinue
Write-ZipArchive -ArchivePath "..\orchestrator-rcl.zip" -Paths $orchestratorFiles

Assert-ArchiveContains -ArchivePath "..\orchestrator-rcl.zip" -Label "orchestrator-rcl.zip" -RequiredEntries @(
    "index.js",
    "account-onboarding-handler.js",
    "account-connect-handler.js",
    "analysis-serializer.js",
    "billing-account-state.js",
    "billing-checkout-handler.js",
    "connection-token.js",
    "evidence-verifier.js",
    "fix-assist-contract-builder.js",
    "fix-assist-triage.js",
    "rewrite-handler.js",
    "rewrite-target-resolver.js",
    "run-supersession.js",
    "super-admin-read-handler.js",
    "schema-draft-builder.js",
    "shared/billing-account-state.js",
    "shared/credit-ledger.js",
    "shared/credit-pricing.js",
    "shared/score-contract.js",
    "shared/scoring-policy.js",
    "shared/schemas/check-runtime-contract-v1.json",
    "shared/schemas/deterministic-explanations-v1.json",
    "shared/schemas/fix-assist-contract-v1.json",
    "shared/schemas/scoring-config-v1.json"
)

$orchSize = [math]::Round((Get-Item "..\orchestrator-rcl.zip").Length / 1MB, 2)
Write-Host "   OK Packaged orchestrator-rcl.zip - $orchSize MB"

# STEP 2: Package Worker
Write-Host ""
Write-Host "[2/4] Packaging Worker Lambda..."

Set-Location (Join-Path $PSScriptRoot "lambda\worker")
Ensure-SharedDefinitions -LambdaDir (Get-Location).Path
Ensure-SharedRuntime -LambdaDir (Get-Location).Path

$workerFiles = @(
    "index.js",
    "analysis-serializer.js",
    "fix-assist-triage.js",
    "schema-draft-builder.js",
    "preflight-handler.js",
    "pii-scrubber.js",
    "package.json",
    "node_modules",
    "schemas",
    "prompts",
    "shared\billing-account-state.js",
    "shared\credit-ledger.js",
    "shared\credit-pricing.js",
    "shared\score-contract.js",
    "shared\scoring-policy.js",
    "shared\schemas\checks-definitions-v1.json",
    "shared\schemas\check-runtime-contract-v1.json",
    "shared\schemas\deterministic-explanations-v1.json",
    "shared\schemas\scoring-config-v1.json"
)

Assert-PathsExist -Paths $workerFiles -Label "worker"

Remove-Item -Path "..\worker-rcl.zip" -Force -ErrorAction SilentlyContinue
Write-ZipArchive -ArchivePath "..\worker-rcl.zip" -Paths $workerFiles

Assert-ArchiveContains -ArchivePath "..\worker-rcl.zip" -Label "worker-rcl.zip" -RequiredEntries @(
    "index.js",
    "analysis-serializer.js",
    "fix-assist-triage.js",
    "schema-draft-builder.js",
    "shared/billing-account-state.js",
    "shared/credit-ledger.js",
    "shared/credit-pricing.js",
    "shared/score-contract.js",
    "shared/scoring-policy.js",
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
$result = (& aws --no-cli-pager lambda update-function-code --function-name $orchestratorFunction --zip-file "fileb://orchestrator-rcl.zip" --region $region --output json 2>&1 | Out-String)
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

$result = (& aws --no-cli-pager lambda update-function-code --function-name $workerFunction --zip-file "fileb://worker-rcl.zip" --region $region --output json 2>&1 | Out-String)
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

Write-Host ""
Write-Host "Reconciling critical HTTP API routes..."
$criticalHttpRoutes = @(
    @{
        RouteKey = "GET /aivi/v1/worker/health"
        AuthorizationType = "NONE"
        SeedRouteKey = "GET /ping"
    },
    @{
        RouteKey = "POST /aivi/v1/rewrite"
        AuthorizationType = "NONE"
        SeedRouteKey = "GET /ping"
    },
    @{
        RouteKey = "GET /aivi/v1/admin/financials/overview"
        AuthorizationType = "JWT"
        SeedRouteKey = "GET /aivi/v1/admin/accounts"
    }
)
foreach ($routeSpec in $criticalHttpRoutes) {
    Ensure-HttpApiRoute `
        -ApiId $httpApiId `
        -Region $region `
        -RouteKey $routeSpec.RouteKey `
        -AuthorizationType $routeSpec.AuthorizationType `
        -SeedRouteKey $routeSpec.SeedRouteKey
}
Write-Host "   OK Critical HTTP API routes reconciled"

# SUMMARY
Write-Host ""
Write-Host "============================================"
Write-Host "DEPLOYMENT COMPLETE"
Write-Host "============================================"
Write-Host "Orchestrator: $orchSize MB"
Write-Host "Worker: $workerSize MB"

Set-Location $PSScriptRoot
