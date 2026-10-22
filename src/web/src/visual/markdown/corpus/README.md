# Visual editor fidelity corpus

Test data for `fidelity.test.ts` (spec 007, research R10). Nothing in this folder is part of
the shipped bundle; only `*.test.ts` files import it.

| Folder | Content | Licence |
|--------|---------|---------|
| `commonmark/` | `spec.json`: the 652 examples of the CommonMark Spec 0.31.2 | CC-BY-SA 4.0, see `commonmark/LICENSE.md` |
| `gfm/` | Examples of the GFM extensions (tables, task lists, strikethrough, autolinks), modelled on the GFM spec | Project licence |
| `azure-devops/` | Pages written for this project in Azure DevOps Wiki style, one shape per file | Project licence |
| `guard/` | Inputs for the load-time guard tests | Project licence |

The repository's specifications (`specs/**/*.md`) are also part of the corpus; `index.ts`
loads them directly (Vite's `server.fs.allow` admits that folder), so they are not copied here.

Line endings and byte order marks are part of the test: `.gitattributes` marks this folder
`-text` so git never normalises them.
