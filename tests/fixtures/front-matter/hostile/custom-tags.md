---
title: Custom tags
run: !!python/object/apply:os.system ["echo pwned"]
fn: !<tag:yaml.org,2002:js/function> "function () { alert(1) }"
---

Tags must not construct objects.
