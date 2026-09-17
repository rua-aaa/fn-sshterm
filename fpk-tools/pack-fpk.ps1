# 打包飞牛 fnOS 应用（fpk）
# 前置：web 已构建（web/dist），且本机有 fnpack.exe

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$fnpack = Join-Path $PSScriptRoot "fnpack.exe"
$proj = Join-Path $root "fpk-project\sshterm"
$webDist = Join-Path $root "web\dist"
$serverSrc = Join-Path $root "server\index.js"
$serverDst = Join-Path $proj "app\server"
$release = Join-Path $root "release"

if (-not (Test-Path $fnpack)) { throw "fnpack.exe not found: $fnpack" }
if (-not (Test-Path (Join-Path $webDist "index.html"))) {
  Write-Host "Building web..."
  Set-Location (Join-Path $root "web")
  & $env:MIMO_NODE ".\node_modules\vite\bin\vite.js" build
}

Copy-Item -Force $serverSrc (Join-Path $serverDst "index.js")
New-Item -ItemType Directory -Force -Path (Join-Path $serverDst "web\dist") | Out-Null
Copy-Item -Recurse -Force (Join-Path $webDist "*") (Join-Path $serverDst "web\dist\")

Set-Location $serverDst
# intentionally do NOT ship node_modules — Docker/native installs at runtime
Remove-Item -Recurse -Force (Join-Path $serverDst "node_modules") -ErrorAction SilentlyContinue
Remove-Item -Force (Join-Path $serverDst "package-lock.json") -ErrorAction SilentlyContinue

Set-Location $proj
& $fnpack build --directory $proj
$fpk = Join-Path $proj "sshterm.fpk"
if (-not (Test-Path $fpk)) { throw "build failed: $fpk" }

New-Item -ItemType Directory -Force -Path $release | Out-Null
# read version from manifest
$ver = "1.0.0"
Get-Content (Join-Path $proj "manifest") | ForEach-Object {
  if ($_ -match '^\s*version\s*=\s*(.+)$') { $ver = $Matches[1].Trim() }
}
$out = Join-Path $release "sshterm-$ver-all.fpk"
Copy-Item -Force $fpk $out
Write-Host "OK $out"
Get-Item $out | Format-List FullName,Length
