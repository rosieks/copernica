{{/*
Checks that values.schema.json cannot express (data-model.md, "Validation summary").
Every message starts with "copernica: " and names the value.
*/}}
{{- define "copernica.validate" -}}
{{- $w := .Values.wiki -}}
{{- include "copernica.checkDeprecated" . -}}

{{- if not $w.auth.mode -}}
{{- fail "copernica: wiki.auth.mode is required (local, entraId or oidc). The container listens on all interfaces, and the wiki refuses to start without authentication." -}}
{{- end -}}

{{- if ne (int .Values.replicaCount) 1 -}}
{{- fail "copernica: replicaCount must be 1. The wiki keeps its data on one volume and serializes writes in one process." -}}
{{- end -}}

{{- $ids := dict -}}
{{- range $w.spaces -}}
{{- if hasKey $ids .id -}}
{{- fail (printf "copernica: wiki.spaces: duplicate id %q" .id) -}}
{{- end -}}
{{- $_ := set $ids .id true -}}
{{- end -}}

{{- $names := dict -}}
{{- range $w.auth.local.users -}}
{{- if hasKey $names .name -}}
{{- fail (printf "copernica: wiki.auth.local.users: duplicate name %q" .name) -}}
{{- end -}}
{{- $_ := set $names .name true -}}
{{- end -}}

{{- range $key := list "syncInterval" "permissionCacheTtl" -}}
{{- $value := get $w $key -}}
{{- if and $value (not (regexMatch "^(\\d+\\.)?\\d{1,2}:\\d{2}:\\d{2}$" $value)) -}}
{{- fail (printf "copernica: wiki.%s %q is not a TimeSpan (hh:mm:ss)" $key $value) -}}
{{- end -}}
{{- end -}}

{{- with $w.permissionCacheTtl -}}
{{- $parts := splitList ":" . -}}
{{- $hours := index $parts 0 -}}
{{- $days := 0 -}}
{{- if contains "." $hours -}}
{{- $days = int (index (splitList "." $hours) 0) -}}
{{- $hours = index (splitList "." $hours) 1 -}}
{{- end -}}
{{- $seconds := add (mul $days 86400) (mul (int $hours) 3600) (mul (int (index $parts 1)) 60) (int (index $parts 2)) -}}
{{- if or (le (int $seconds) 0) (gt (int $seconds) 300) -}}
{{- fail (printf "copernica: wiki.permissionCacheTtl %q exceeds the maximum of 00:05:00 (or is zero)" .) -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Renamed values (FR-018). Each entry maps an old values path to its new path. A value set
at an old path fails with its new name, so it is never silently ignored. Example entry:
  "wiki.syncEvery" "wiki.syncInterval"
The map is empty in 0.1.0; tests pass a temporary one through .Values.global.
*/}}
{{- define "copernica.checkDeprecated" -}}
{{- $renamed := dict -}}
{{- with .Values.global -}}{{- with .copernicaTestRenamed }}{{ $renamed = . }}{{ end -}}{{- end -}}
{{- range $old, $new := $renamed -}}
{{- $node := $.Values -}}
{{- $found := true -}}
{{- range splitList "." $old -}}
{{- if and $found (kindIs "map" $node) (hasKey $node .) -}}
{{- $node = get $node . -}}
{{- else -}}
{{- $found = false -}}
{{- end -}}
{{- end -}}
{{- if $found -}}
{{- fail (printf "copernica: %s was renamed to %s" $old $new) -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Flattens a value into leaf paths. Input: dict "prefix" "value" "out"; out maps the
lower-case path (without a "_FILE" suffix) to the original path (keys joined with ":").
*/}}
{{- define "copernica.flatten" -}}
{{- $prefix := .prefix -}}
{{- $out := .out -}}
{{- if and (kindIs "map" .value) (gt (len .value) 0) -}}
{{- range $key, $value := .value -}}
{{- include "copernica.flatten" (dict "prefix" (ternary $key (printf "%s:%s" $prefix $key) (eq $prefix "")) "value" $value "out" $out) -}}
{{- end -}}
{{- else if and (kindIs "slice" .value) (gt (len .value) 0) -}}
{{- range $index, $value := .value -}}
{{- include "copernica.flatten" (dict "prefix" (printf "%s:%d" $prefix (int $index)) "value" $value "out" $out) -}}
{{- end -}}
{{- else -}}
{{- /* "X" and "X_FILE" are the same setting: the application loads the file into "X". */ -}}
{{- $_ := set $out (lower $prefix | trimSuffix "_file") $prefix -}}
{{- end -}}
{{- end -}}

{{/*
Rejects free-form settings that overlap a modeled or reserved setting (FR-014).
Input: dict "document" "extra".
*/}}
{{- define "copernica.checkExtraSettings" -}}
{{- $modeled := dict -}}
{{- include "copernica.flatten" (dict "prefix" "" "value" .document "out" $modeled) -}}
{{- $extra := dict -}}
{{- include "copernica.flatten" (dict "prefix" "" "value" .extra "out" $extra) -}}
{{- $reserved := list "copernica:datadirectory" "copernica:urls" -}}
{{- /* Document path prefix -> values path, longest first. */ -}}
{{- $origins := list
  (list "copernica:auth:mode" "wiki.auth.mode")
  (list "copernica:auth:local" "wiki.auth.local")
  (list "copernica:auth:entraid" "wiki.auth.entraId")
  (list "copernica:auth:oidc" "wiki.auth.oidc")
  (list "copernica:azuredevops:synccredential" "wiki.azureDevOps.syncCredential")
  (list "copernica:azuredevops:server" "wiki.azureDevOps.server")
  (list "copernica:forwardedheaders" "wiki.forwardedHeaders")
  (list "copernica:publicbaseurl" "wiki.publicBaseUrl")
  (list "copernica:syncinterval" "wiki.syncInterval")
  (list "copernica:permissioncachettl" "wiki.permissionCacheTtl")
  (list "copernica:maxrenderbytes" "wiki.maxRenderBytes")
  (list "copernica:fallbackemaildomain" "wiki.fallbackEmailDomain")
  (list "copernica:attachments" "wiki.attachments")
  (list "copernica:spaces" "wiki.spaces") -}}
{{- range $path, $original := $extra -}}
{{- $shown := printf "wiki.extraSettings.%s" (replace ":" "." $original) -}}
{{- range $reserved -}}
{{- if or (eq $path .) (hasPrefix (printf "%s:" .) $path) -}}
{{- fail (printf "copernica: %s is managed by the chart" $shown) -}}
{{- end -}}
{{- end -}}
{{- range $modeledPath, $_ := $modeled -}}
{{- if or (eq $path $modeledPath) (hasPrefix (printf "%s:" $path) $modeledPath) (hasPrefix (printf "%s:" $modeledPath) $path) -}}
{{- $origin := "wiki" -}}
{{- range $origins -}}
{{- if and (eq $origin "wiki") (or (eq $modeledPath (index . 0)) (hasPrefix (printf "%s:" (index . 0)) $modeledPath)) -}}
{{- $origin = index . 1 -}}
{{- end -}}
{{- end -}}
{{- fail (printf "copernica: %s conflicts with %s" $shown $origin) -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}
