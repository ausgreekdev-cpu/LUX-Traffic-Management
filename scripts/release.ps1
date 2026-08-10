# Builds Windows artifacts (NSIS + portable + ISO) and publishes them to a GitHub release.
# Usage:  npm run release          (uses version from package.json)
#         powershell -File scripts/release.ps1 -Version 1.1.1
#         powershell -File scripts/release.ps1 -SkipBuild -SkipUpload
param(
  [string]$Version,
  [string]$IsoTool,
  [switch]$SkipBuild,
  [switch]$SkipUpload
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $root "release"
$repo = "ausgreekdev-cpu/LUX-Traffic-Management"

if (-not $Version) {
  $pkg = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
  $Version = $pkg.version
}
$tag = "v$Version"
Write-Host "==> Releasing LUX Traffic Management $Version (tag $tag)" -ForegroundColor Cyan

if (-not $SkipBuild) {
  Write-Host "==> Building frontend + Electron artifacts (this takes a few minutes)"
  Push-Location $root
  try { & npm run electron:build }
  finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw "electron:build failed" }

  if (-not $IsoTool) {
    $candidate = Get-Command oscdimg -ErrorAction SilentlyContinue
    if (-not $candidate) { $candidate = Get-Command (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\oscdimg.exe") -ErrorAction SilentlyContinue }
    if ($candidate) { $IsoTool = $candidate.Source }
  }
  if ($IsoTool) {
    Write-Host "==> Building ISO from win-unpacked"
    $iso = Join-Path $releaseDir "LUX-Traffic-Management.iso"
    if (Test-Path $iso) { Remove-Item $iso -Force }
    & $IsoTool -m -o -u2 -udfver102 -l"LUX_TRAFFIC" (Join-Path $releaseDir "win-unpacked") $iso | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "oscdimg failed" }
  } else {
    Write-Warning "oscdimg not found - skipping ISO (pass -IsoTool path)"
  }
}

if ($SkipUpload) {
  Write-Host "==> Build complete. Upload skipped (pass -SkipUpload only for local builds)."
  return
}

$installer = Join-Path $releaseDir "LUX Traffic Management Setup $Version.exe"
$portable  = Join-Path $releaseDir "LUX Traffic Management-$Version-portable.exe"
$iso       = Join-Path $releaseDir "LUX-Traffic-Management.iso"
$assets = @($installer, $portable, $iso) | Where-Object { Test-Path $_ }
$assets += Get-ChildItem $releaseDir -File | Where-Object { $_.Name -eq "latest.yml" -or $_.Name -like "*.blockmap" } | Select-Object -ExpandProperty FullName
$assets = @($assets | Select-Object -Unique)
if (-not $assets.Count) { throw "No artifacts found in $releaseDir" }
Write-Host "==> Uploading $($assets.Count) asset(s) to GitHub release $tag"
foreach ($a in $assets) { Write-Host "    - $(Split-Path $a -Leaf)" }

$cred = "protocol=https`nhost=github.com`n" | git -c credential.helper=wincred credential fill
$token = ($cred -split "`n" | Where-Object { $_ -like "password=*" }) -replace "^password=", ""
if (-not $token) { throw "No GitHub token available from git credential manager (run: git credential-manager github login)" }
$headers = @{ Authorization = "Bearer $token" }

$release = $null
try {
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/tags/$tag" -Method Get -Headers $headers -TimeoutSec 30
  Write-Host "    Release already exists: $($release.html_url)"
} catch {
  $body = @{
    tag_name = $tag
    name = "LUX Traffic Management $Version"
    body = "LUX Traffic Management v$Version - Windows installer, portable and ISO."
    draft = $false
    prerelease = $false
  } | ConvertTo-Json
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases" -Method Post -Headers $headers -Body $body -ContentType "application/json" -TimeoutSec 30
  Write-Host "    Release created: $($release.html_url)"
}

foreach ($existing in $release.assets) {
  Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/assets/$($existing.id)" -Method Delete -Headers $headers -TimeoutSec 30 | Out-Null
  Write-Host "    Deleted old asset: $($existing.name)"
}

foreach ($a in $assets) {
  $name = [IO.Path]::GetFileName($a)
  $enc = [Uri]::EscapeDataString($name)
  $mime = if ($name -like "*.iso") { "application/x-iso9660-image" } elseif ($name -like "*.yml") { "text/yaml" } else { "application/octet-stream" }
  Write-Host "    Uploading $name ..."
  curl.exe -sS -X POST -H "Authorization: $($headers.Authorization)" -H "Content-Type: $mime" --data-binary "@$a" "https://uploads.github.com/repos/$repo/releases/$($release.id)/assets?name=$enc" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Upload failed for $name (exit $LASTEXITCODE)" }
}
Write-Host "==> Done: $($release.html_url)" -ForegroundColor Green
