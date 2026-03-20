param(
    [string]$OutputDir = "dist",
    [string]$PackageName = "AiVI-WP-Plugin",
    [string]$PluginFolderName = "AiVI-WP-Plugin",
    [switch]$ListOnly
)

$ErrorActionPreference = "Stop"

$pluginRoot = Split-Path -Parent $PSScriptRoot
$outputDirPath = Join-Path $pluginRoot $OutputDir
$stageRoot = Join-Path $outputDirPath "_stage"
$stagePluginRoot = Join-Path $stageRoot $PluginFolderName
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
        Get-ChildItem -Path $sourcePath -Recurse -File | ForEach-Object {
            $childRelativePath = $_.FullName.Substring($sourcePath.Length + 1)
            Copy-AllowlistedItem -RelativePath (Join-Path $RelativePath $childRelativePath)
        }
        return
    }

    $destinationDir = Split-Path -Parent $destinationPath
    if ($destinationDir) {
        New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
    }

    $sourceStream = $null
    $destinationStream = $null
    try {
        $sourceStream = [System.IO.File]::Open($sourcePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        $destinationStream = [System.IO.File]::Open($destinationPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        $sourceStream.CopyTo($destinationStream)
    } finally {
        if ($destinationStream) {
            $destinationStream.Dispose()
        }
        if ($sourceStream) {
            $sourceStream.Dispose()
        }
    }
}

function New-NormalizedZipArchive {
    param(
        [string]$SourceRoot,
        [string]$DestinationZip
    )

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    $archive = [System.IO.Compression.ZipFile]::Open($DestinationZip, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        $sourceRootPath = (Resolve-Path $SourceRoot).Path
        $sourceRootLength = $sourceRootPath.Length

        Get-ChildItem -Path $SourceRoot -Recurse -Directory | Sort-Object FullName | ForEach-Object {
            $directoryPath = $_.FullName
            $relativePath = ($directoryPath.Substring($sourceRootLength + 1) -replace '\\', '/').Trim('/')
            if (-not [string]::IsNullOrWhiteSpace($relativePath)) {
                [void]$archive.CreateEntry($relativePath + '/')
            }
        }

        Get-ChildItem -Path $SourceRoot -Recurse -File | ForEach-Object {
            $fullPath = $_.FullName
            $relativePath = $fullPath.Substring($sourceRootLength + 1) -replace '\\', '/'
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $fullPath, $relativePath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally {
        $archive.Dispose()
    }
}

if ($ListOnly) {
    Write-Output "PLUGIN_ROOT=$pluginRoot"
    Write-Output "PLUGIN_FOLDER_NAME=$PluginFolderName"
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

New-NormalizedZipArchive -SourceRoot $stageRoot -DestinationZip $zipPath

$zipSizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Output ("PACKAGED=" + $zipPath)
Write-Output ("SIZE_MB=" + $zipSizeMb)
