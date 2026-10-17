<#
.SYNOPSIS
  Publishes self-contained single-file executables and smoke-tests the one for this machine.

.DESCRIPTION
  research.md R1: single-file publishing with the native libgit2 library has a history of load
  failures, so every artifact that can run here is started and exercised (sign-in, create a
  page = a real libgit2 commit). If single-file fails on a platform, publish with
  -FolderPublish and ship the folder as one archive instead.
#>
[CmdletBinding()]
param(
    [string[]] $Runtime = @('win-x64', 'osx-arm64', 'linux-x64', 'linux-arm64'),
    [string] $Output = (Join-Path (Split-Path -Parent $PSScriptRoot) 'artifacts'),
    [switch] $FolderPublish,
    [switch] $SkipSmokeTest
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root 'src/Copernica/Copernica.csproj'

Push-Location (Join-Path $root 'src/web')
try {
    npm ci
    if ($LASTEXITCODE) { throw 'npm ci failed' }
    npm run build
    if ($LASTEXITCODE) { throw 'web build failed' }
}
finally { Pop-Location }

foreach ($rid in $Runtime) {
    $target = Join-Path $Output $rid
    $single = if ($FolderPublish) { 'false' } else { 'true' }
    dotnet publish $project -c Release -r $rid --self-contained -o $target `
        -p:SkipWebBuild=true -p:PublishSingleFile=$single -p:IncludeNativeLibrariesForSelfExtract=true `
        -p:DebugType=none
    if ($LASTEXITCODE) { throw "publish failed for $rid" }
    Write-Host "Published $rid to $target"
}

if ($SkipSmokeTest) { return }

$current = [System.Runtime.InteropServices.RuntimeInformation]::RuntimeIdentifier -replace '^win10-', 'win-'
$rid = $Runtime | Where-Object { $_ -eq $current } | Select-Object -First 1
if (-not $rid) { Write-Warning "No artifact for this machine ($current); smoke test skipped."; return }

$exe = Join-Path $Output $rid ($IsWindows ? 'copernica.exe' : 'copernica')
$data = Join-Path ([System.IO.Path]::GetTempPath()) ("copernica-smoke-" + [guid]::NewGuid().ToString('N'))
$hash = 'secret' | & $exe hash-password
$port = 18080
$env:Copernica__DataDirectory = $data
$env:Copernica__Urls = "http://127.0.0.1:$port"
$env:Copernica__Auth__Mode = 'Local'
$env:Copernica__Auth__Local__Users__0__Name = 'smoke'
$env:Copernica__Auth__Local__Users__0__PasswordHash = $hash
$env:Copernica__Spaces__0__Id = 'smoke'
$process = Start-Process -FilePath $exe -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path ([System.IO.Path]::GetTempPath()) 'copernica-smoke.log')
try {
    $base = "http://127.0.0.1:$port"
    $ready = $false
    for ($i = 0; $i -lt 60 -and -not $ready; $i++) {
        Start-Sleep -Milliseconds 500
        try { $ready = (Invoke-WebRequest "$base/health/ready" -UseBasicParsing).StatusCode -eq 200 } catch { }
    }
    if (-not $ready) { throw 'Server did not become ready.' }

    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    Invoke-WebRequest "$base/auth/config" -WebSession $session -UseBasicParsing | Out-Null
    $xsrf = { ($session.Cookies.GetCookies($base) | Where-Object Name -eq 'XSRF-TOKEN').Value }
    Invoke-RestMethod "$base/auth/login" -Method Post -WebSession $session -ContentType 'application/json' `
        -Headers @{ 'X-XSRF-TOKEN' = & $xsrf } -Body '{"username":"smoke","password":"secret"}' | Out-Null
    Invoke-RestMethod "$base/api/spaces/smoke/pages/smoke.md" -Method Put -WebSession $session -ContentType 'application/json' `
        -Headers @{ 'X-XSRF-TOKEN' = & $xsrf } -Body '{"markdown":"# Smoke test","message":"Smoke test"}' | Out-Null
    $page = Invoke-RestMethod "$base/api/spaces/smoke/pages/smoke.md" -WebSession $session
    if ($page.title -ne 'Smoke test') { throw "Unexpected page title '$($page.title)'." }
    $index = Invoke-WebRequest "$base/" -UseBasicParsing
    if ($index.Content -notmatch '<div id="root">') { throw 'Web UI is not embedded.' }
    Write-Host "Smoke test passed for $rid." -ForegroundColor Green
}
finally {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $data -ErrorAction SilentlyContinue
}
