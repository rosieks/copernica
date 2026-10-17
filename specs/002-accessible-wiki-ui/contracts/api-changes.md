# API Changes: Consistent, Accessible Wiki Interface

Two **additive, backward-compatible** changes to
[001 openapi.yaml](../../001-git-backed-team-wiki/contracts/openapi.yaml), plus one change
to how the SPA shell document is served. Existing clients keep working unchanged.
Rationale: [research.md](../research.md) R3 and R6.

The OpenAPI file stays the single source for the generated client
(`npm run gen:api`). The changes below are applied to that file in the implementation
task, not duplicated in a second YAML file.

---

## 1. `GET /api/spaces/{spaceId}/history/{path}` — new `version` parameter

```yaml
parameters:
  - name: version
    in: query
    required: false
    schema: { type: string, pattern: '^[0-9a-f]{40}$' }
    description: >
      Commit id to start the history walk from (inclusive). Defaults to the space
      branch head. Must be reachable from the space branch; otherwise 404.
```

- Response schema unchanged (`HistoryPage`). With `limit=1`, the single item is the
  change that produced the page *as of* that commit. This is the commit shown in the
  PageInfo line (FR-021).
- `cursor` keeps its meaning (offset), relative to the chosen start commit.
- Errors:
  - `400`: malformed id;
  - `404`: unknown or unreachable commit, unknown page, or no read access. These are
    deliberately indistinguishable, as in 001.
- Authorization: unchanged (read access to the space).

## 2. `SaveResult` — new `mergedAuthors` field

```yaml
SaveResult:
  type: object
  required: [version, merged, mergedAuthors]
  properties:
    version: { $ref: '#/components/schemas/PageVersionRef' }
    merged: { type: boolean }
    mergedAuthors:
      type: array
      items: { type: string }
      description: >
        Distinct author names, oldest first, of the commits that changed this page
        between the edit's base and the branch tip it was merged with. Empty when no
        change to this page was merged.
```

- It applies to the page save/create endpoint (`PUT …/pages/{path}`), the only endpoint
  returning `SaveResult`. Delete keeps `204`.
- It uses the same source as `EditConflict.theirsAuthors`: the author names of the
  commits that touched the page file.
- *Refinement during implementation:* 001 sets `merged: true` whenever the branch moved,
  even if only *other* pages changed. `mergedAuthors` therefore covers only commits that
  changed this page. The UI shows the merge Toast only when the list is non-empty, and a
  plain "Saved" otherwise (FR-007).

## 3. SPA shell document — per-request style nonce

This is not part of the JSON API, but it is an interface between server and browser
(research R3).

| Aspect | Contract |
|--------|----------|
| Applies to | Every `text/html` response of the SPA fallback (`/`, `/s/...`, `/profile`, `/signin`, …) |
| Nonce | 128-bit value from a cryptographic RNG, base64; new on every response |
| Document | `<meta name="csp-nonce" content="<nonce>">` in `<head>` (build placeholder `__CSP_NONCE__` replaced) |
| Header | Same CSP as today, with `style-src 'self' 'nonce-<nonce>'`; all other directives unchanged |
| Caching | `Cache-Control: no-cache` (unchanged); `index.html` is not served by the static-file middleware |
| Other responses | `/api/*`, `/auth/*`, `/assets/*`, `/health/*`: static CSP, unchanged |

`SECURITY.md` must describe this change (Constitution, Quality Gates).

## Tests

- **History `version`**: returns the given commit's change; `404` for a commit not on the
  branch; `404` without read access; history paging from a start commit.
- **`mergedAuthors`**: two-author merge lists both names; non-merged save gives `[]`.
- **Nonce**:
  - two consecutive shell responses carry different nonces;
  - the header nonce equals the meta nonce;
  - API responses do not contain a nonce;
  - the placeholder never leaks (`__CSP_NONCE__` absent).
