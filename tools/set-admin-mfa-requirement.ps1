param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('true', 'false')]
    [string]$Required,

    [string]$FunctionName = 'aivi-orchestrator-run-dev',

    [string]$Region = 'eu-north-1'
)

$ErrorActionPreference = 'Stop'

$config = aws lambda get-function-configuration `
    --function-name $FunctionName `
    --region $Region `
    --output json | ConvertFrom-Json

$envVars = @{}
if ($config.Environment -and $config.Environment.Variables) {
    $config.Environment.Variables.PSObject.Properties | ForEach-Object {
        $envVars[$_.Name] = [string]$_.Value
    }
}

$envVars['AIVI_ADMIN_REQUIRE_MFA'] = $Required

$payload = @{ Variables = $envVars } | ConvertTo-Json -Compress -Depth 12
$tmpPath = Join-Path $env:TEMP ("aivi-admin-mfa-" + [guid]::NewGuid().ToString() + ".json")

try {
    [System.IO.File]::WriteAllText($tmpPath, $payload, (New-Object System.Text.UTF8Encoding($false)))

    aws lambda update-function-configuration `
        --function-name $FunctionName `
        --region $Region `
        --environment "file://$tmpPath" `
        --output json | Out-Null

    aws lambda wait function-updated `
        --function-name $FunctionName `
        --region $Region

    aws lambda get-function-configuration `
        --function-name $FunctionName `
        --region $Region `
        --query 'Environment.Variables.AIVI_ADMIN_REQUIRE_MFA' `
        --output text
}
finally {
    if (Test-Path $tmpPath) {
        Remove-Item $tmpPath -Force -ErrorAction SilentlyContinue
    }
}
