# Invalid chart values

Each file holds one mistake. Its first line is `# expect: <text>`, and rendering it must
fail with an error containing that text, before any resource is created
(`scripts/test-helm.ps1`).
