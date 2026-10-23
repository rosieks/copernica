#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Checks the Helm chart in deploy/helm/copernica (specs/008-helm-chart).

.DESCRIPTION
  Render checks (no cluster): helm lint, rendering of the defaults, every example and every
  tests/helm/valid case with assertions, kubeconform, every tests/helm/invalid case (must
  fail with the message in its "# expect:" header), and credential leak checks.

  Cluster checks (skipped with -RenderOnly): run against the current kubectl context, which
  must be a disposable cluster (kind in CI) that can use the image copernica:<ImageTag>.
  Pod Security dry runs, install, sign-in, upgrade (restart, data kept, password kept),
  free-form settings and uninstall.

.EXAMPLE
  pwsh scripts/test-helm.ps1 -RenderOnly
  pwsh scripts/test-helm.ps1 -ImageTag dev
#>
[CmdletBinding()]
param(
    [switch]$RenderOnly,
    [string[]]$KubeVersions = @('1.27.0', '1.31.0'),
    [string]$ImageTag = 'dev',
    [string]$Namespace = 'copernica-test'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
$chart = Join-Path $root 'deploy/helm/copernica'
$examples = Join-Path $chart 'examples'
$cases = Join-Path $root 'tests/helm'

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "FAILED: $Message" }
}

function Invoke-Native([string]$Command, [string[]]$Arguments, [string]$InputText) {
    $output = if ($PSBoundParameters.ContainsKey('InputText')) { $InputText | & $Command @Arguments 2>&1 } else { & $Command @Arguments 2>&1 }
    [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output | ForEach-Object { "$_" }) -join "`n" }
}

function Invoke-Render([string[]]$ValuesFiles = @(), [string[]]$Extra = @(), [switch]$AllowFailure) {
    $arguments = @('template', 'wiki', $chart, '--namespace', 'wiki')
    foreach ($file in $ValuesFiles) { $arguments += @('-f', $file) }
    $result = Invoke-Native helm ($arguments + $Extra)
    if (-not $AllowFailure -and $result.ExitCode -ne 0) { throw "helm template failed:`n$($result.Output)" }
    $result
}

function Get-Documents([string]$Yaml) {
    @($Yaml -split '(?m)^---\s*$' | Where-Object { $_ -match '(?m)^kind:' })
}

function Get-Document([string]$Yaml, [string]$Kind) {
    ,@(Get-Documents $Yaml | Where-Object { $_ -match "(?m)^kind: $Kind\s*$" })
}

# The rendered copernica.json as a hashtable.
function Get-Config([string]$Yaml) {
    $configMap = (Get-Document $Yaml 'ConfigMap')[0]
    $json = ($configMap -split "`n" | Select-Object -Skip 1 |
        ForEach-Object -Begin { $inside = $false } -Process {
            if ($_ -match '^  copernica\.json: \|') { $inside = $true; return }
            if ($inside) { if ($_ -match '^    ' -or $_.Trim() -eq '') { $_ } else { $inside = $false } }
        }) -join "`n"
    $json | ConvertFrom-Json -AsHashtable
}

function Get-Checksum([string]$Yaml) {
    if ($Yaml -match 'checksum/config: ([0-9a-f]{64})') { return $Matches[1] }
    throw 'checksum/config not found'
}

function Test-Case([string]$Title, [scriptblock]$Body) {
    Write-Host "  $Title" -NoNewline
    & $Body
    Write-Host ' ok' -ForegroundColor Green
}

# ---------------------------------------------------------------------------------------
Write-Host 'Lint and render' -ForegroundColor Cyan
$renderSets = [ordered]@{ 'defaults' = @(@(), @('--set', 'wiki.auth.mode=local')) }
foreach ($file in Get-ChildItem $examples -Filter *.yaml) { $renderSets["examples/$($file.Name)"] = @(@($file.FullName), @()) }
foreach ($file in Get-ChildItem (Join-Path $cases 'valid') -Filter *.yaml) { $renderSets["valid/$($file.Name)"] = @(@($file.FullName), @()) }

$rendered = @{}
foreach ($name in $renderSets.Keys) {
    $files, $extra = $renderSets[$name]
    Test-Case "render $name" {
        $lintArguments = @('lint', $chart, '--strict', '--quiet')
        foreach ($file in $files) { $lintArguments += @('-f', $file) }
        $lint = Invoke-Native helm ($lintArguments + $extra)
        Assert-True ($lint.ExitCode -eq 0) "helm lint $name`n$($lint.Output)"
        $rendered[$name] = (Invoke-Render $files $extra).Output
    }
}

Write-Host 'Kubernetes schemas (kubeconform)' -ForegroundColor Cyan
foreach ($name in $rendered.Keys) {
    foreach ($version in $KubeVersions) {
        Test-Case "$name @ $version" {
            $result = Invoke-Native kubeconform @('-strict', '-summary', '-kubernetes-version', $version, '-') $rendered[$name]
            Assert-True ($result.ExitCode -eq 0) "kubeconform $name`n$($result.Output)"
        }
    }
}

Write-Host 'Invalid values (must fail before anything is created)' -ForegroundColor Cyan
foreach ($file in Get-ChildItem (Join-Path $cases 'invalid') -Filter *.yaml | Sort-Object Name) {
    Test-Case $file.Name {
        $header = Get-Content $file.FullName -TotalCount 1
        Assert-True ($header -match '^# expect: (.+)$') "$($file.Name) has no '# expect:' header"
        $expected = $Matches[1].Trim()
        $result = Invoke-Render @($file.FullName) -AllowFailure
        Assert-True ($result.ExitCode -ne 0) "$($file.Name) rendered, but should fail with '$expected'"
        Assert-True ($result.Output.Contains($expected)) "$($file.Name): expected '$expected' in:`n$($result.Output)"
    }
}

Write-Host 'Assertions' -ForegroundColor Cyan

Test-Case 'US1: hierarchy, no indexed keys, unset settings omitted' {
    $yaml = $rendered['valid/us1-structure.yaml']
    $config = Get-Config $yaml
    Assert-True ($config.Copernica.Auth.Mode -eq 'EntraId') 'Auth.Mode'
    Assert-True ($config.Copernica.Spaces[1].Folder -eq 'docs') 'Spaces[1].Folder'
    Assert-True ($config.Copernica.Spaces[1].Attachments.Path -eq 'images') 'Spaces[1].Attachments.Path'
    Assert-True ($config.Copernica.Spaces[0].Provider -eq 'AzureDevOps') 'Spaces[0].Provider'
    Assert-True (-not $config.Copernica.ContainsKey('SyncInterval')) 'unset SyncInterval must be omitted'
    Assert-True ($yaml -notmatch '__\d+__') 'no indexed environment-variable keys'
}

Test-Case 'US1: public address from the ingress' {
    Assert-True ((Get-Config $rendered['valid/us1-ingress.yaml']).Copernica.PublicBaseUrl -eq 'https://wiki.example.internal') 'https with TLS'
    $plain = Invoke-Render @(Join-Path $cases 'valid/us1-ingress.yaml') @('--set-json', 'ingress.tls=[]')
    Assert-True ((Get-Config $plain.Output).Copernica.PublicBaseUrl -eq 'http://wiki.example.internal') 'http without TLS'
    $explicit = Invoke-Render @(Join-Path $cases 'valid/us1-ingress.yaml') @('--set', 'wiki.publicBaseUrl=https://docs.example.internal')
    Assert-True ((Get-Config $explicit.Output).Copernica.PublicBaseUrl -eq 'https://docs.example.internal') 'explicit address wins'
}

Test-Case 'US1: restricted defaults and single replica' {
    $deployment = (Get-Document $rendered['defaults'] 'Deployment')[0]
    foreach ($expected in 'replicas: 1', 'type: Recreate', 'runAsNonRoot: true', 'readOnlyRootFilesystem: true',
        'allowPrivilegeEscalation: false', '- ALL', 'type: RuntimeDefault', 'automountServiceAccountToken: false',
        'value: /etc/copernica/copernica.json') {
        Assert-True ($deployment.Contains($expected)) "Deployment must contain '$expected'"
    }
    Assert-True ((Get-Document $rendered['defaults'] 'Ingress').Count -eq 0) 'no ingress by default'
}

Test-Case 'US2: credentials only as mounted Secret keys' {
    $yaml = $rendered['valid/us2-secrets.yaml']
    $config = Get-Config $yaml
    $paths = @{
        'auth/oidc/client-secret' = $config.Copernica.Auth.Oidc.ClientSecret_FILE
        'azure-devops/client-secret' = $config.Copernica.AzureDevOps.SyncCredential.ClientSecret_FILE
        'spaces/handbook/token' = $config.Copernica.Spaces[0].Credential.Token_FILE
    }
    foreach ($path in $paths.Keys) {
        Assert-True ($paths[$path] -eq "/var/run/secrets/copernica/$path") "config points at $path"
        Assert-True ($yaml -match "(?m)^\s+path: $([regex]::Escape($path))\s*$") "projected volume has $path"
    }
    $configMap = (Get-Document $yaml 'ConfigMap')[0]
    Assert-True (-not $configMap.Contains('credential-sentinel')) 'Secret names and keys stay out of the ConfigMap'
}

Test-Case 'US2: generated initial user only in its Secret (SC-006)' {
    $yaml = (Invoke-Render @() @('--set', 'wiki.auth.mode=local')).Output
    $secret = (Get-Document $yaml 'Secret')
    Assert-True ($secret.Count -eq 1) 'one generated Secret'
    Assert-True ($secret[0] -match 'password: (\S+)') 'Secret has a password'
    $password = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Matches[1]))
    Assert-True ($password.Length -eq 24) 'password has 24 characters'
    foreach ($document in Get-Documents $yaml | Where-Object { $_ -notmatch '(?m)^kind: Secret\s*$' }) {
        Assert-True (-not $document.Contains($password)) 'password appears outside its Secret'
        Assert-True (-not $document.Contains($Matches[1])) 'encoded password appears outside its Secret'
    }
    $config = Get-Config $yaml
    Assert-True ($config.Copernica.Auth.Local.Users[0].Name -eq 'admin') 'initial user name'
    Assert-True ($config.Copernica.Auth.Local.Users[0].Password_FILE -eq '/var/run/secrets/copernica/auth/local/initial/password') 'initial user password file'
}

Test-Case 'US2: no credential sentinel value in any example' {
    foreach ($name in $rendered.Keys) {
        foreach ($document in Get-Documents $rendered[$name] | Where-Object { $_ -match '(?m)^kind: ConfigMap\s*$' }) {
            Assert-True ($document -notmatch '"(ClientSecret|Pat|Token|PasswordHash|Password)"\s*:') "${name}: a credential value key is in the ConfigMap"
        }
    }
}

Test-Case 'US4: extension points (SC-008)' {
    $yaml = $rendered['examples/extensions.yaml']
    $deployment = (Get-Document $yaml 'Deployment')[0]
    foreach ($expected in 'image: registry.example.internal/copernica:0.1.0', 'name: regcred', 'cost-centre: wiki',
        'backup.example.com/enabled: "true"', 'example.com/owner: docs-team', 'name: TZ', 'configMapRef:',
        'mountPath: /etc/ssl/custom', 'name: wait-for-proxy', 'name: log-shipper', 'priorityClassName: internal-tools',
        'kubernetes.io/os: linux', 'topologyKey: kubernetes.io/hostname', 'serviceAccountName: wiki-copernica',
        'memory: 2Gi', 'key: dedicated') {
        Assert-True ($deployment.Contains($expected)) "Deployment must contain '$expected'"
    }
    $configIndex = $deployment.IndexOf('name: COPERNICA_CONFIG_FILE')
    Assert-True ($configIndex -ge 0 -and $configIndex -lt $deployment.IndexOf('name: TZ')) 'extraEnv comes after COPERNICA_CONFIG_FILE'
    Assert-True ($deployment.IndexOf('name: copernica') -lt $deployment.IndexOf('name: log-shipper')) 'sidecar after the wiki container'
    $policy = (Get-Document $yaml 'NetworkPolicy')
    Assert-True ($policy.Count -eq 1 -and $policy[0].Contains('name: wiki-copernica-ingress')) 'extra manifest rendered with tpl'
    foreach ($kind in 'Service', 'Ingress', 'PersistentVolumeClaim', 'ConfigMap', 'ServiceAccount') {
        Assert-True ((Get-Document $yaml $kind)[0].Contains('cost-centre: wiki')) "$kind has commonLabels"
    }
    Assert-True ((Get-Document $yaml 'Service')[0].Contains('example.com/scrape: "true"')) 'service annotation'
    $claim = (Get-Document $yaml 'PersistentVolumeClaim')[0]
    Assert-True ($claim.Contains('storageClassName: fast') -and $claim.Contains('storage: 20Gi')) 'persistence options'
}

Test-Case 'US4: existing claim and digest' {
    $yaml = $rendered['valid/us4-existing-claim.yaml']
    Assert-True ((Get-Document $yaml 'PersistentVolumeClaim').Count -eq 0) 'no claim rendered'
    Assert-True ((Get-Document $yaml 'Deployment')[0].Contains('claimName: copernica-data')) 'mounts the existing claim'
    $digest = (Get-Document $rendered['valid/us4-digest.yaml'] 'Deployment')[0]
    Assert-True ($digest -match 'image: copernica@sha256:[0-9a-f]{64}\s') 'digest instead of tag'
}

Test-Case 'US5: free-form settings reach the configuration' {
    $config = Get-Config $rendered['valid/us5-extra.yaml']
    Assert-True ($config.Copernica.MaxRenderBytes -eq 2048) 'Copernica.MaxRenderBytes'
    Assert-True ($config.Logging.LogLevel.Default -eq 'Warning') 'Logging.LogLevel.Default'
    Assert-True ($config.Copernica.Database.Provider -eq 'Example') 'unknown future group'
    Assert-True ($config.Copernica.Spaces[0].Id -eq 'handbook') 'modeled settings kept'
}

Test-Case 'US6: checksum follows settings and Secret references' {
    $local = Join-Path $examples 'local.yaml'
    $a = Get-Checksum (Invoke-Render @($local)).Output
    $b = Get-Checksum (Invoke-Render @($local)).Output
    $renamed = Get-Checksum (Invoke-Render @($local) @('--set', 'wiki.spaces[0].displayName=Renamed')).Output
    $otherSecret = Get-Checksum (Invoke-Render @($local) @('--set', 'wiki.auth.local.users[0].passwordHash.secretName=other')).Output
    Assert-True ($a -eq $b) 'same values, same checksum'
    Assert-True ($a -ne $renamed) 'changed setting changes the checksum'
    Assert-True ($a -ne $otherSecret) 'changed Secret reference changes the checksum'
}

Test-Case 'US6: renamed values are never silently ignored' {
    $result = Invoke-Render @() @('--set', 'wiki.auth.mode=local', '--set', 'global.copernicaTestRenamed.global\.oldSetting=wiki.newSetting', '--set', 'global.oldSetting=x') -AllowFailure
    Assert-True ($result.ExitCode -ne 0 -and $result.Output.Contains('copernica: global.oldSetting was renamed to wiki.newSetting')) "renamed value must fail:`n$($result.Output)"
}

if ($RenderOnly) {
    Write-Host 'Render checks passed (cluster checks skipped).' -ForegroundColor Green
    exit 0
}

# ---------------------------------------------------------------------------------------
Write-Host "Cluster checks (context $(kubectl config current-context), namespace $Namespace)" -ForegroundColor Cyan

$image = @('--set', 'image.repository=copernica', '--set', "image.tag=$ImageTag", '--set', 'image.pullPolicy=Never')

function Invoke-Kubectl([string[]]$Arguments, [string]$InputText) {
    $result = if ($PSBoundParameters.ContainsKey('InputText')) { Invoke-Native kubectl $Arguments $InputText } else { Invoke-Native kubectl $Arguments }
    if ($result.ExitCode -ne 0) { throw "kubectl $($Arguments -join ' ') failed:`n$($result.Output)" }
    $result.Output
}

function Invoke-HelmChecked([string[]]$Arguments) {
    $result = Invoke-Native helm $Arguments
    if ($result.ExitCode -ne 0) { throw "helm $($Arguments -join ' ') failed:`n$($result.Output)" }
    $result.Output
}


# Port-forwards started by Start-Wiki; all are stopped at the end.
$script:forwards = [Collections.Generic.List[Diagnostics.Process]]::new()

# A port-forward to the release's service, with a web session for the API.
function Start-Wiki([string]$Release, [int]$Port, $Session) {
    $log = [IO.Path]::GetTempFileName()
    $options = @{ PassThru = $true; RedirectStandardOutput = $log; RedirectStandardError = "$log.err" }
    if ($IsWindows) { $options.WindowStyle = 'Hidden' }
    $process = Start-Process kubectl -ArgumentList @('-n', $Namespace, 'port-forward', "svc/$Release-copernica", "$($Port):80") @options
    $script:forwards.Add($process)
    $base = "http://127.0.0.1:$Port"
    for ($i = 0; $i -lt 60; $i++) {
        try { Invoke-WebRequest "$base/health/ready" -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Seconds 1 }
    }
    if (-not $Session) {
        # GET / issues the antiforgery cookie the API requires on writes.
        $Session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
        Invoke-WebRequest "$base/" -WebSession $Session | Out-Null
    }
    [pscustomobject]@{ Base = $base; Session = $Session }
}

function Invoke-Api($Wiki, [string]$Method, [string]$Path, $Body) {
    $token = $Wiki.Session.Cookies.GetCookies([Uri]$Wiki.Base) | Where-Object Name -eq 'XSRF-TOKEN' | Select-Object -First 1
    $parameters = @{ Uri = "$($Wiki.Base)$Path"; Method = $Method; WebSession = $Wiki.Session; Headers = @{ 'X-XSRF-TOKEN' = "$($token.Value)" } }
    if ($null -ne $Body) { $parameters.Body = ($Body | ConvertTo-Json -Depth 10); $parameters.ContentType = 'application/json' }
    Invoke-RestMethod @parameters
}

function Connect-Wiki($Wiki, [string]$User, [string]$Password) {
    Invoke-Api $Wiki 'POST' '/auth/login' @{ username = $User; password = $Password } | Out-Null
}

function Wait-Rollout([string]$Release) {
    Invoke-Kubectl @('-n', $Namespace, 'rollout', 'status', "deploy/$Release-copernica", '--timeout=300s') | Out-Null
}

function Get-PodUid([string]$Release) {
    Invoke-Kubectl @('-n', $Namespace, 'get', 'pods', '-l', "app.kubernetes.io/instance=$Release", '--field-selector=status.phase=Running', '-o', 'jsonpath={.items[0].metadata.uid}')
}

function Get-SecretValue([string]$Name, [string]$Key) {
    $encoded = Invoke-Kubectl @('-n', $Namespace, 'get', 'secret', $Name, '-o', "jsonpath={.data.$Key}")
    [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded))
}

$state = @{}
try {
    Invoke-Native kubectl @('delete', 'namespace', $Namespace, '--wait=true', '--ignore-not-found') | Out-Null
    Invoke-Kubectl @('create', 'namespace', $Namespace) | Out-Null
    Invoke-Kubectl @('label', 'namespace', $Namespace, 'pod-security.kubernetes.io/enforce=restricted', 'pod-security.kubernetes.io/warn=restricted') | Out-Null

    Test-Case 'Pod Security: defaults and every example pass restricted (SC-005)' {
        foreach ($name in $rendered.Keys | Where-Object { $_ -like 'examples/*' -or $_ -eq 'defaults' }) {
            $result = Invoke-Native kubectl @('apply', '--dry-run=server', '-n', $Namespace, '-f', '-') $rendered[$name]
            Assert-True ($result.Output -notmatch 'violate PodSecurity') "$name violates restricted:`n$($result.Output)"
        }
    }

    Test-Case 'US1: install examples/local.yaml, sign in, list spaces, save a page' {
        $hash = (Invoke-Native docker @('run', '--rm', '-i', "copernica:$ImageTag", 'hash-password') 'alice-password').Output.Trim()
        Assert-True ($hash.Length -gt 20) "hash-password output: $hash"
        Invoke-Kubectl @('-n', $Namespace, 'create', 'secret', 'generic', 'wiki-local-users', "--from-literal=alice=$hash") | Out-Null
        Invoke-HelmChecked (@('install', 'alpha', $chart, '-n', $Namespace, '-f', (Join-Path $examples 'local.yaml')) + $image) | Out-Null
        Wait-Rollout 'alpha'
        $wiki = Start-Wiki 'alpha' 18080
        Connect-Wiki $wiki 'alice' 'alice-password'
        $ids = @(Invoke-Api $wiki 'GET' '/api/spaces' | ForEach-Object { $_ } | ForEach-Object { $_.id })
        Assert-True ($ids -contains 'handbook' -and $ids -contains 'sandbox') "spaces listed: $($ids -join ', ')"
        Invoke-Api $wiki 'PUT' '/api/spaces/sandbox/pages/hello.md' @{ markdown = "# Hello`n`nhello world`n"; message = 'Add hello' } | Out-Null
    }

    Test-Case 'US2: generated initial account signs in' {
        Invoke-HelmChecked (@('install', 'beta', $chart, '-n', $Namespace, '--set', 'wiki.auth.mode=local', '--set', 'wiki.spaces[0].id=sandbox') + $image) | Out-Null
        Wait-Rollout 'beta'
        $state.password = Get-SecretValue 'beta-copernica-initial-user' 'password'
        $state.wiki = Start-Wiki 'beta' 18081
        Connect-Wiki $state.wiki 'admin' $state.password
        Invoke-Api $state.wiki 'PUT' '/api/spaces/sandbox/pages/notes.md' @{ markdown = "# Notes`n`nkeep this discussion`n"; message = 'Add notes' } | Out-Null
        $page = Invoke-Api $state.wiki 'GET' '/api/spaces/sandbox/pages/notes.md'
        # Anchor offsets are into the rendered page's text content.
        $text = [Net.WebUtility]::HtmlDecode([regex]::Replace($page.html, '<[^>]+>', ''))
        $start = $text.IndexOf('keep this')
        Invoke-Api $state.wiki 'POST' '/api/spaces/sandbox/discussions' @{
            path = 'notes.md'; body = 'Survives upgrades?'
            anchor = @{ exact = 'keep this'; prefix = $text.Substring(0, $start); suffix = $text.Substring($start + 9); start = $start; end = $start + 9; commitId = $page.version.commitId }
        } | Out-Null
    }

    Test-Case 'US6: upgrade restarts and keeps data, session and password (SC-007)' {
        $podBefore = Get-PodUid 'beta'
        $claimBefore = Invoke-Kubectl @('-n', $Namespace, 'get', 'pvc', 'beta-copernica-data', '-o', 'jsonpath={.metadata.uid}')
        Invoke-HelmChecked (@('upgrade', 'beta', $chart, '-n', $Namespace, '--set', 'wiki.auth.mode=local', '--set', 'wiki.spaces[0].id=sandbox', '--set', 'wiki.spaces[0].displayName=Renamed') + $image) | Out-Null
        Wait-Rollout 'beta'
        Assert-True ((Get-PodUid 'beta') -ne $podBefore) 'pod replaced after a setting change'
        Assert-True ((Invoke-Kubectl @('-n', $Namespace, 'get', 'pvc', 'beta-copernica-data', '-o', 'jsonpath={.metadata.uid}')) -eq $claimBefore) 'same claim'
        Assert-True ((Get-SecretValue 'beta-copernica-initial-user' 'password') -eq $state.password) 'password unchanged'
        # Same browser session against the new pod: cookies are not tied to a port.
        $wiki = Start-Wiki 'beta' 18082 $state.wiki.Session
        $spaces = @(Invoke-Api $wiki 'GET' '/api/spaces' | ForEach-Object { $_ })
        Assert-True (($spaces | Where-Object id -eq 'sandbox').displayName -eq 'Renamed') 'still signed in, new display name'
        $discussions = Invoke-Api $wiki 'GET' '/api/spaces/sandbox/discussions?path=notes.md'
        Assert-True (($discussions | ConvertTo-Json -Depth 10).Contains('Survives upgrades?')) 'discussion kept'
    }

    Test-Case 'US5: free-form setting reaches the running wiki' {
        Invoke-HelmChecked (@('upgrade', 'alpha', $chart, '-n', $Namespace, '-f', (Join-Path $examples 'local.yaml'), '--set', 'wiki.extraSettings.Copernica.MaxRenderBytes=2048') + $image) | Out-Null
        Wait-Rollout 'alpha'
        $wiki = Start-Wiki 'alpha' 18083
        Connect-Wiki $wiki 'alice' 'alice-password'
        Invoke-Api $wiki 'PUT' '/api/spaces/sandbox/pages/large.md' @{ markdown = "# Large`n`n" + ('x' * 4096) + "`n"; message = 'Add a large page' } | Out-Null
        Assert-True ((Invoke-Api $wiki 'GET' '/api/spaces/sandbox/pages/large.md').tooLarge -eq $true) 'a 4 KB page is too large with MaxRenderBytes=2048'
        Assert-True ((Invoke-Api $wiki 'GET' '/api/spaces/sandbox/pages/hello.md').tooLarge -eq $false) 'page saved before the upgrade is still there'
    }

    Test-Case 'US6: uninstall keeps the volume and the generated Secret' {
        Invoke-HelmChecked @('uninstall', 'beta', '-n', $Namespace, '--wait') | Out-Null
        Invoke-Kubectl @('-n', $Namespace, 'get', 'pvc', 'beta-copernica-data') | Out-Null
        Invoke-Kubectl @('-n', $Namespace, 'get', 'secret', 'beta-copernica-initial-user') | Out-Null
    }
}
finally {
    foreach ($process in $script:forwards) { if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force } }
}

Write-Host 'All chart checks passed.' -ForegroundColor Green
