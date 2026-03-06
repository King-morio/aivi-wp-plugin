param(
    [string]$OutputDir = "dist",
    [string]$PackageName = "AiVI-WP-Plugin",
    [switch]$ListOnly
)

$ErrorActionPreference = "Stop"

$pluginRoot = Split-Path -Parent $PSScriptRoot
$outputDirPath = Join-Path $pluginRoot $OutputDir
$stageRoot = Join-Path $outputDirPath "_stage"
$stagePluginRoot = Join-Path $stageRoot $PackageName
$zipPath = Join-Path $outputDirPath ($PackageName + ".zip")

# Runtime allowlist. Release zips should include only files WordPress needs.
$allowlist = @(
    "ai-visibility-inspector.php",
    "LICENSE",
    "readme.md",
    "assets",
    "includes"
)

function Copy-AllowlistedItem {
    param(
        [string]$RelativePath
    )

    $sourcePath = Join-Path $pluginRoot $RelativePath
    if (-not (Test-Path $sourcePath)) {
        return
    }

    $destinationPath = Join-Path $stagePluginRoot $RelativePath
    if ((Get-Item $sourcePath) -is [System.IO.DirectoryInfo]) {
        New-Item -ItemType Directory -Force -Path $destinationPath | Out-Null
        Copy-Item -Path (Join-Path $sourcePath "*") -Destination $destinationPath -Recurse -Force
        return
    }

    $destinationDir = Split-Path -Parent $destinationPath
    if ($destinationDir) {
        New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
    }
    Copy-Item -Path $sourcePath -Destination $destinationPath -Force
}

if ($ListOnly) {
    Write-Output "PLUGIN_ROOT=$pluginRoot"
    Write-Output "ALLOWLIST_COUNT=$($allowlist.Count)"
    $allowlist | ForEach-Object { Write-Output ("KEEP:" + $_) }
    exit 0
}

New-Item -ItemType Directory -Force -Path $outputDirPath | Out-Null

if (Test-Path $stageRoot) {
    Remove-Item -Path $stageRoot -Recurse -Force
}
if (Test-Path $zipPath) {
    Remove-Item -Path $zipPath -Force
}

New-Item -ItemType Directory -Force -Path $stagePluginRoot | Out-Null

foreach ($item in $allowlist) {
    Copy-AllowlistedItem -RelativePath $item
}

Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal -Force

$zipSizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Output ("PACKAGED=" + $zipPath)
Write-Output ("SIZE_MB=" + $zipSizeMb)
