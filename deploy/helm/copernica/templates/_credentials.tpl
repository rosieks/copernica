{{/*
Registers a Secret reference for the projected "credentials" volume and returns the file
path the application reads it from (through the matching <Setting>_FILE key).
Usage: include "copernica.secretFile" (list $state $reference "relative/path")
*/}}
{{- define "copernica.secretFile" -}}
{{- $state := index . 0 -}}
{{- $reference := index . 1 -}}
{{- $path := index . 2 -}}
{{- $_ := set $state "projected" (append $state.projected (dict "secretName" $reference.secretName "key" $reference.key "path" $path)) -}}
{{- printf "/var/run/secrets/copernica/%s" $path -}}
{{- end -}}

{{/* The projected volume sources, grouped per Secret. Input: the "projected" list. */}}
{{- define "copernica.projectedSources" -}}
{{- range . }}
- secret:
    name: {{ .secretName }}
    items:
      - key: {{ .key | quote }}
        path: {{ .path }}
{{- end }}
{{- end -}}
