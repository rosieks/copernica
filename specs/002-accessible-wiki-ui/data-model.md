# Data Model: Consistent, Accessible Wiki Interface

This feature adds **no server-side entities, tables or stored fields**. The 001 data
model ([001 data-model.md](../001-git-backed-team-wiki/data-model.md)) is unchanged. The
two API additions ([contracts/api-changes.md](contracts/api-changes.md)) expose data that
is already derived from git history.

The entities in the spec are client-side.

## Interface preference *(browser `localStorage`)*

| Key | Type | Default | Rules |
|-----|------|---------|-------|
| `copernica.singleKeyShortcuts` | `"on"` \| `"off"` | `"on"` (absent ⇒ on) | FR-017. Read on startup; a change applies immediately (shortcut registry re-evaluated) and is broadcast to other tabs through the `storage` event |
| `copernica.editorTab` | `"write"` \| `"preview"` \| `"split"` | `"split"` ≥ 1200 px, else `"write"` | Convenience only; `split` treated as `write` below 1200 px |

- It is never sent to the server and is not tied to the signed-in user. A shared
  computer shares the preference (accepted: it holds no personal data).
- Unknown or corrupt values fall back to the default.
- Storage access errors (private mode, blocked storage) are caught, and the default is
  used for the session.

## Notification *(in memory, Toast queue)*

| Field | Type | Rules |
|-------|------|-------|
| `id` | string | Unique within the session |
| `tone` | `success` \| `info` \| `danger` | `danger` Toasts are not used for action failures (inline Callout instead, FR-008); reserved for background problems such as "Session expired" |
| `title` | string | Required, short |
| `description` | string? | e.g. merged authors |
| `action` | `{ label, onSelect }`? | Optional, e.g. *View history* |
| `duration` | ms | `6000` success, `8000` merge/info; never < `5000` (FR-006) |

**Lifecycle**:

```text
queued → open → (timer elapses while not hovered/focused | user dismisses) → closed
```

The queue survives route changes and is lost on reload.

## State indicator *(derived, not stored)*

Derived on every render of the read view, from data the screen already has.

| Indicator | Shown when | Source |
|-----------|-----------|--------|
| Out of sync | `space.state ∈ {outOfSync, unavailable}` | `Space.state`, `Space.lastSyncAt`, `Space.message` |
| Older version | `page.isCurrent === false` | `Page.isCurrent`; author/date from PageInfo |
| Read only | `space.canWrite === false` | `Space.canWrite` |

Several indicators may be shown at once, in the fixed order above (US1-7).

## Page information *(derived, query cache)*

| Field | Source |
|-------|--------|
| `authorName`, `authoredAt`, `message`, `commitId` | First item of `GET …/history/{path}?version=<shown commit>&limit=1` |

The query key is `['pageInfo', spaceId, path, commitId]`, so it is immutable for a given
commit and cached for the session. It is fetched only after the page content query
succeeds (FR-024).

## Unchanged client state from 001

- **Editor drafts**: `sessionStorage`, `drafts.ts`.
- **Discussion filter**: component state, default `open`.
- **CSP style nonce**: read from `<meta name="csp-nonce">` and passed to `setNonce()`.
  Per page load, never stored (research R3).
