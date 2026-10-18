# Configuration Changes: Paste and Drop Images

Additions to [001 configuration.md](../../001-git-backed-team-wiki/contracts/configuration.md).
As before, every setting can be given as an environment variable
(`Copernica__Attachments__Path`) or in the config file.

| Setting | Default | Meaning |
|---------|---------|---------|
| `Copernica:Attachments:Path` | `.attachments` | Where new images are stored, relative to the **space root**. Template tokens: `{dir}` (folder of the page) and `{page}` (page path without `.md`) |
| `Copernica:Spaces:N:Attachments:Path` | *(the default above)* | Per-space override |
| `Copernica:Attachments:MaxBytes` | `10485760` | Maximum size of one image (bytes) |
| `Copernica:Attachments:MaxPendingBytesPerUser` | `209715200` | Maximum total size of a user's unsaved images |

Examples:

```bash
# Azure DevOps Wiki compatible (default, nothing to set)
Copernica__Attachments__Path=.attachments

# a docs site that keeps images in docs/images (space Folder=docs)
Copernica__Spaces__1__Attachments__Path=images

# one folder per page, as some Markdown editors do
Copernica__Spaces__2__Attachments__Path={page}.assets

# images next to the page
Copernica__Spaces__3__Attachments__Path={dir}
```

**Validation** (at startup, per space):
- The template must stay inside the space: no `..`, no leading `/`, no `\`, only the two
  tokens.
- An invalid template makes only that space unavailable. It is logged and shown as the
  space's state message. Other spaces start normally (001 FR-026).

**Files written** (for `SECURITY.md`):
- `<DataDirectory>/pending/` holds unsaved uploads until they are saved or expire, 24 h
  after the last use.
- The SQLite table `pending_images` holds their metadata.

Nothing else is written outside the repositories, and no outbound connections are added.
