# Quickstart: Validating the Helm Chart

Runnable checks that show the feature works. The values reference is in
[contracts/values.md](contracts/values.md). The automated version of steps 1–3 is
`scripts/test-helm.ps1`, which runs in CI.

## Prerequisites

- Helm 3.12+, kubectl, Docker, kind, kubeconform, PowerShell 7.
- Image built and loaded into kind:

```bash
docker build -f deploy/Dockerfile -t copernica:dev .
kind create cluster --name copernica
kind load docker-image copernica:dev --name copernica
kubectl create namespace wiki
kubectl label namespace wiki pod-security.kubernetes.io/enforce=restricted
```

## 1. Render and validate (no cluster)

```bash
helm lint deploy/helm/copernica -f deploy/helm/copernica/examples/local.yaml
pwsh scripts/test-helm.ps1 -RenderOnly
```

Expected:
- the defaults (with `wiki.auth.mode` set) and every file in `examples/` render;
- kubeconform reports 0 invalid resources;
- every case in `tests/helm/invalid/` fails with its expected message (SC-004);
- no credential sentinel appears outside a Secret (SC-006).

## 2. Install with a generated initial account (User Story 1, 2)

```bash
helm install wiki deploy/helm/copernica -n wiki \
  -f deploy/helm/copernica/examples/local.yaml \
  --set image.repository=copernica --set image.tag=dev
kubectl -n wiki rollout status deploy/wiki-copernica --timeout=3m
```

Expected:
- the pod is admitted under `restricted` and becomes Ready;
- NOTES print the command that reads the password;
- `kubectl -n wiki port-forward svc/wiki-copernica 8080:80`, then sign in at
  `http://localhost:8080` as `admin` with that password;
- both spaces from the example are listed, and saving a page works.

## 3. Upgrade keeps data and restarts on change (User Story 6)

1. Start a discussion on a page.
2. Change a space's `displayName` in a copy of the example and run `helm upgrade` with
   the same flags.

Expected:
- a new pod replaces the old one, and the old one stops first (`Recreate`);
- the new display name is shown;
- the discussion is still there and you are still signed in (SC-007);
- the initial-user password is unchanged;
- `helm uninstall wiki -n wiki` leaves the PVC `wiki-copernica-data` and the Secret
  `wiki-copernica-initial-user` in place.

## 4. Secrets only by reference (User Story 2)

```bash
kubectl -n wiki create secret generic wiki-git --from-literal=token=sentinel-123
```

Add `credential: { token: { secretName: wiki-git, key: token } }` to a space and upgrade.

Expected:
- `helm get manifest wiki -n wiki | grep sentinel-123` prints nothing;
- the space synchronizes.

Then replace the reference with `token: sentinel-123`. Expected: the upgrade fails with
`Invalid type. Expected: object`.

## 5. Extension points (User Story 4, 5)

```bash
helm upgrade wiki deploy/helm/copernica -n wiki \
  -f deploy/helm/copernica/examples/extensions.yaml \
  --set image.repository=copernica --set image.tag=dev
```

`extensions.yaml` sets:
- `imagePullSecrets`;
- pod labels and annotations;
- an extra environment variable;
- an extra volume with its mount;
- a sidecar;
- an `extraManifests` NetworkPolicy;
- `wiki.extraSettings.Copernica.MaxRenderBytes: 2048`.

Expected:
- every addition appears in `kubectl get deploy,netpol -o yaml`;
- the pod is still admitted under `restricted`;
- a page larger than 2 KB shows the "too large to render" message, which proves the
  free-form setting reached the application.

Adding `wiki.extraSettings.Copernica.Auth.Mode: Oidc` makes the upgrade fail with a
conflict message naming `wiki.auth.mode`.

## 6. Migration from the kustomize manifests

```bash
kubectl -n copernica delete deploy/copernica svc/copernica secret/copernica
helm install wiki deploy/helm/copernica -n copernica -f my-values.yaml \
  --set persistence.existingClaim=copernica-data
```

Expected: the existing pages, discussions and data-protection keys are used, so signed-in
users stay signed in.

## Clean up

```bash
kind delete cluster --name copernica
```
