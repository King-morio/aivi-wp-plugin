param(
    [string]$ContentPath,
    [string]$RunId
)
$ErrorActionPreference = "Stop"
$api = "https://6nj5cw1dj0.execute-api.eu-north-1.amazonaws.com/dev"
if (-not $RunId) {
    if (-not $ContentPath) {
        $ContentPath = "c:\Users\Administrator\Studio\aivi\wp-content\plugins\AiVI-WP-Plugin\tools\artifacts_html\manifests_7b58dc95-d470-43d6-ab10-a691cab03efd_manifest.html"
    }
    $content = Get-Content -Raw $ContentPath
    $payload = @{
        title = "Artifact replay"
        content_html = $content
        site_id = "artifact-replay"
        post_id = "artifact-" + (Get-Date -Format "yyyyMMddHHmmss")
        content_type = "post"
        enable_web_lookups = $false
    } | ConvertTo-Json -Compress
    $submitResponse = Invoke-RestMethod -Uri "$api/aivi/v1/analyze/run" -Method Post -Body $payload -ContentType "application/json"
    $RunId = $submitResponse.run_id
    "RUN_ID=$RunId"
}
$status = "queued"
$statusResponse = $null
for ($i = 1; $i -le 40 -and $status -notin @("success","failed","failed_schema","aborted"); $i++) {
    Start-Sleep -Seconds 5
    try {
        $statusResponse = Invoke-RestMethod -Uri "$api/aivi/v1/analyze/run/$RunId" -Method Get
        $status = $statusResponse.status
        "Attempt $i : $status"
    } catch {
        "Attempt $i : Poll error $($_.Exception.Message)"
    }
}
"FINAL_STATUS=$status"
if ($statusResponse) {
    $statusResponse | ConvertTo-Json -Depth 6
}
