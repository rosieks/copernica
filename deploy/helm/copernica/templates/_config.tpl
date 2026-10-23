{{/*
Builds the application's configuration document from .Values.wiki (data-model.md).
Returns JSON: { "document": <configuration>, "projected": [ {secretName, key, path} ] }.
Unset optional values are left out so the application's own defaults apply.
*/}}
{{- define "copernica.build" -}}
{{- include "copernica.validate" . -}}
{{- $w := .Values.wiki -}}
{{- $state := dict "projected" list -}}
{{- $c := dict -}}

{{- with include "copernica.publicBaseUrl" . }}{{ $_ := set $c "PublicBaseUrl" . }}{{ end }}
{{- with $w.syncInterval }}{{ $_ := set $c "SyncInterval" . }}{{ end }}
{{- with $w.permissionCacheTtl }}{{ $_ := set $c "PermissionCacheTtl" . }}{{ end }}
{{- if not (kindIs "invalid" $w.maxRenderBytes) }}{{ $_ := set $c "MaxRenderBytes" $w.maxRenderBytes }}{{ end }}
{{- with $w.fallbackEmailDomain }}{{ $_ := set $c "FallbackEmailDomain" . }}{{ end }}
{{- with $w.forwardedHeaders.knownProxies }}{{ $_ := set $c "ForwardedHeaders" (dict "KnownProxies" .) }}{{ end }}

{{- /* Authentication: only the selected mode is configured, so only its Secrets are mounted. */ -}}
{{- $auth := dict "Mode" (get (dict "local" "Local" "entraId" "EntraId" "oidc" "Oidc") $w.auth.mode) -}}
{{- if eq $w.auth.mode "local" -}}
  {{- $users := list -}}
  {{- if $w.auth.local.users -}}
    {{- range $i, $u := $w.auth.local.users -}}
      {{- $user := dict "Name" $u.name -}}
      {{- with $u.displayName }}{{ $_ := set $user "DisplayName" . }}{{ end -}}
      {{- with $u.email }}{{ $_ := set $user "Email" . }}{{ end -}}
      {{- $_ := set $user "PasswordHash_FILE" (include "copernica.secretFile" (list $state $u.passwordHash (printf "auth/local/%d/password-hash" (int $i)))) -}}
      {{- $users = append $users $user -}}
    {{- end -}}
  {{- else -}}
    {{- $reference := dict "secretName" (include "copernica.initialUserSecretName" .) "key" "password" -}}
    {{- $users = list (dict "Name" $w.auth.local.initialUser.name "Password_FILE" (include "copernica.secretFile" (list $state $reference "auth/local/initial/password"))) -}}
  {{- end -}}
  {{- $_ := set $auth "Local" (dict "Users" $users) -}}
{{- else if eq $w.auth.mode "entraId" -}}
  {{- $entra := dict "TenantId" $w.auth.entraId.tenantId "ClientId" $w.auth.entraId.clientId -}}
  {{- with $w.auth.entraId.instance }}{{ $_ := set $entra "Instance" . }}{{ end -}}
  {{- $_ := set $entra "ClientSecret_FILE" (include "copernica.secretFile" (list $state $w.auth.entraId.clientSecret "auth/entra-id/client-secret")) -}}
  {{- $_ := set $auth "EntraId" $entra -}}
{{- else if eq $w.auth.mode "oidc" -}}
  {{- $oidc := dict "Authority" $w.auth.oidc.authority "ClientId" $w.auth.oidc.clientId -}}
  {{- $_ := set $oidc "ClientSecret_FILE" (include "copernica.secretFile" (list $state $w.auth.oidc.clientSecret "auth/oidc/client-secret")) -}}
  {{- $_ := set $auth "Oidc" $oidc -}}
{{- end -}}
{{- $_ := set $c "Auth" $auth -}}

{{- /* Azure DevOps: only the selected sync credential type. */ -}}
{{- $ado := dict -}}
{{- $sync := $w.azureDevOps.syncCredential -}}
{{- if and $sync.type (ne $sync.type "none") -}}
  {{- $credential := dict "Type" (get (dict "servicePrincipal" "ServicePrincipal" "managedIdentity" "ManagedIdentity" "pat" "Pat") $sync.type) -}}
  {{- if eq $sync.type "servicePrincipal" -}}
    {{- $_ := set $credential "TenantId" $sync.tenantId -}}
    {{- $_ := set $credential "ClientId" $sync.clientId -}}
    {{- $_ := set $credential "ClientSecret_FILE" (include "copernica.secretFile" (list $state $sync.clientSecret "azure-devops/client-secret")) -}}
  {{- else if eq $sync.type "managedIdentity" -}}
    {{- with $sync.managedIdentityClientId }}{{ $_ := set $credential "ManagedIdentityClientId" . }}{{ end -}}
  {{- else if eq $sync.type "pat" -}}
    {{- $_ := set $credential "Pat_FILE" (include "copernica.secretFile" (list $state $sync.pat "azure-devops/pat")) -}}
  {{- end -}}
  {{- $_ := set $ado "SyncCredential" $credential -}}
{{- end -}}
{{- if $w.azureDevOps.server.userPat }}{{ $_ := set $ado "Server" (dict "UserPat" true) }}{{ end -}}
{{- if $ado }}{{ $_ := set $c "AzureDevOps" $ado }}{{ end -}}

{{- $attachments := dict -}}
{{- with $w.attachments.path }}{{ $_ := set $attachments "Path" . }}{{ end -}}
{{- if not (kindIs "invalid" $w.attachments.maxBytes) }}{{ $_ := set $attachments "MaxBytes" $w.attachments.maxBytes }}{{ end -}}
{{- if not (kindIs "invalid" $w.attachments.maxPendingBytesPerUser) }}{{ $_ := set $attachments "MaxPendingBytesPerUser" $w.attachments.maxPendingBytesPerUser }}{{ end -}}
{{- if $attachments }}{{ $_ := set $c "Attachments" $attachments }}{{ end -}}

{{- /* Spaces: the list position becomes the index; the deployer never writes it. */ -}}
{{- $spaces := list -}}
{{- range $w.spaces -}}
  {{- $space := dict "Id" .id -}}
  {{- with .displayName }}{{ $_ := set $space "DisplayName" . }}{{ end -}}
  {{- with .provider }}{{ $_ := set $space "Provider" (get (dict "git" "Git" "azureDevOps" "AzureDevOps") .) }}{{ end -}}
  {{- with .remoteUrl }}{{ $_ := set $space "RemoteUrl" . }}{{ end -}}
  {{- with .branch }}{{ $_ := set $space "Branch" . }}{{ end -}}
  {{- with .folder }}{{ $_ := set $space "Folder" . }}{{ end -}}
  {{- with .attachments }}{{ with .path }}{{ $_ := set $space "Attachments" (dict "Path" .) }}{{ end }}{{ end -}}
  {{- with .credential -}}
    {{- $credential := dict -}}
    {{- with .username }}{{ $_ := set $credential "Username" . }}{{ end -}}
    {{- if .token }}{{ $_ := set $credential "Token_FILE" (include "copernica.secretFile" (list $state .token (printf "spaces/%s/token" $space.Id))) }}{{ end -}}
    {{- if $credential }}{{ $_ := set $space "Credential" $credential }}{{ end -}}
  {{- end -}}
  {{- $spaces = append $spaces $space -}}
{{- end -}}
{{- if $spaces }}{{ $_ := set $c "Spaces" $spaces }}{{ end -}}

{{- $document := dict "Copernica" $c -}}
{{- with $w.extraSettings -}}
  {{- include "copernica.checkExtraSettings" (dict "document" $document "extra" .) -}}
  {{- $document = mergeOverwrite (deepCopy $document) (deepCopy .) -}}
{{- end -}}
{{- toJson (dict "document" $document "projected" $state.projected) -}}
{{- end -}}
