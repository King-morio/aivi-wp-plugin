param(
    [string]$OutputDir = "dist\\public-repo",
    [string]$ManifestPath = "tools\\public-repo-allowlist.json",
    [switch]$ListOnly
)

$ErrorActionPreference = "Stop"

$pluginRoot = Split-Path -Parent $PSScriptRoot
$manifestFullPath = Join-Path $pluginRoot $ManifestPath

if (-not (Test-Path $manifestFullPath)) {
    throw "Allowlist manifest not found: $manifestFullPath"
}

$manifest = Get-Content $manifestFullPath -Raw | ConvertFrom-Json
$snapshotName = if ($manifest.snapshotName) { [string]$manifest.snapshotName } else { "AiVI-WP-Plugin-public" }
$excludePaths = @()
if ($manifest.PSObject.Properties.Name -contains 'excludePaths' -and $manifest.excludePaths) {
    $excludePaths = @($manifest.excludePaths | ForEach-Object { [string]$_ })
}
$outputDirPath = Join-Path $pluginRoot $OutputDir
$stageRoot = Join-Path $outputDirPath "_stage"
$stageSnapshotRoot = Join-Path $stageRoot $snapshotName
$zipPath = Join-Path $outputDirPath ($snapshotName + ".zip")

function Test-IsExcludedPath {
    param(
        [string]$RelativePath
    )

    $normalizedRelativePath = ($RelativePath -replace '/', '\').TrimStart('\')
    foreach ($excludedPath in $excludePaths) {
        $normalizedExcludedPath = ($excludedPath -replace '/', '\').TrimStart('\')
        if ($normalizedRelativePath -ieq $normalizedExcludedPath) {
            return $true
        }
        if ($normalizedRelativePath.StartsWith($normalizedExcludedPath + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    }

    return $false
}

function Copy-AllowlistedItem {
    param(
        [string]$RelativePath
    )

    if (Test-IsExcludedPath -RelativePath $RelativePath) {
        return
    }

    $sourcePath = Join-Path $pluginRoot $RelativePath
    if (-not (Test-Path $sourcePath)) {
        return
    }

    $destinationPath = Join-Path $stageSnapshotRoot $RelativePath
    $sourceItem = Get-Item $sourcePath

    if ($sourceItem -is [System.IO.DirectoryInfo]) {
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
    Write-Output ("PLUGIN_ROOT=" + $pluginRoot)
    Write-Output ("SNAPSHOT_NAME=" + $snapshotName)
    Write-Output ("ITEM_COUNT=" + $manifest.items.Count)
    $manifest.items | ForEach-Object {
        Write-Output ("KEEP:{0}:{1}:{2}" -f $_.type, $_.path, $_.reason)
    }
    foreach ($excludedPath in $excludePaths) {
        Write-Output ("SKIP:" + $excludedPath)
    }
    $manifest.excludedLanes | ForEach-Object {
        Write-Output ("EXCLUDE:" + $_)
    }
    exit 0
}

New-Item -ItemType Directory -Force -Path $outputDirPath | Out-Null

if (Test-Path $stageRoot) {
    Remove-Item -Path $stageRoot -Recurse -Force
}
if (Test-Path $zipPath) {
    Remove-Item -Path $zipPath -Force
}

New-Item -ItemType Directory -Force -Path $stageSnapshotRoot | Out-Null

foreach ($item in $manifest.items) {
    Copy-AllowlistedItem -RelativePath ([string]$item.path)
}

New-NormalizedZipArchive -SourceRoot $stageRoot -DestinationZip $zipPath

$fileCount = (Get-ChildItem -Path $stageSnapshotRoot -Recurse -File | Measure-Object).Count
$zipSizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)

Write-Output ("SNAPSHOT_ROOT=" + $stageSnapshotRoot)
Write-Output ("FILE_COUNT=" + $fileCount)
Write-Output ("ZIP_PATH=" + $zipPath)
Write-Output ("SIZE_MB=" + $zipSizeMb)
