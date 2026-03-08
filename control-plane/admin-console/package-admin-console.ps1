param(
    [string]$OutputDir = "dist",
    [string]$RuntimeConfigPath = "",
    [switch]$UseStagingExample
)

$ErrorActionPreference = "Stop"

$consoleRoot = $PSScriptRoot
$outputDirPath = Join-Path $consoleRoot $OutputDir
$stageRoot = Join-Path $outputDirPath "_stage"
$stageAppRoot = Join-Path $stageRoot "admin-console"
$bundlePath = Join-Path $outputDirPath "admin-console-bundle.zip"

function Resolve-RuntimeConfigSource {
    if ($UseStagingExample -and [string]::IsNullOrWhiteSpace($RuntimeConfigPath)) {
        return Join-Path $consoleRoot "runtime-config.staging.example.js"
    }

    if (-not [string]::IsNullOrWhiteSpace($RuntimeConfigPath)) {
        if ([System.IO.Path]::IsPathRooted($RuntimeConfigPath)) {
            return $RuntimeConfigPath
        }
        return Join-Path $consoleRoot $RuntimeConfigPath
    }

    return Join-Path $consoleRoot "runtime-config.js"
}

$runtimeConfigSource = Resolve-RuntimeConfigSource
if (-not (Test-Path $runtimeConfigSource)) {
    throw "Runtime config source not found: $runtimeConfigSource"
}

New-Item -ItemType Directory -Force -Path $outputDirPath | Out-Null

if (Test-Path $stageRoot) {
    Remove-Item -Path $stageRoot -Recurse -Force
}
if (Test-Path $bundlePath) {
    Remove-Item -Path $bundlePath -Force
}

New-Item -ItemType Directory -Force -Path $stageAppRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stageAppRoot "src") | Out-Null

Copy-Item -Path (Join-Path $consoleRoot "index.html") -Destination (Join-Path $stageAppRoot "index.html") -Force
Copy-Item -Path (Join-Path $consoleRoot "src\\*") -Destination (Join-Path $stageAppRoot "src") -Recurse -Force
Copy-Item -Path $runtimeConfigSource -Destination (Join-Path $stageAppRoot "runtime-config.js") -Force

Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $bundlePath -CompressionLevel Optimal -Force

$zipSizeMb = [math]::Round((Get-Item $bundlePath).Length / 1MB, 2)
Write-Output ("PACKAGED=" + $bundlePath)
Write-Output ("RUNTIME_CONFIG=" + (Resolve-Path $runtimeConfigSource))
Write-Output ("SIZE_MB=" + $zipSizeMb)
