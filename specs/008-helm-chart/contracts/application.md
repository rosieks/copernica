# Contract: Application Changes

The application needs two small changes so the chart can configure it. Both are additions:
existing configuration keeps working unchanged. Both apply to every deployment
(binary, Docker, Kubernetes) and are documented in the
[001 configuration contract](../../001-git-backed-team-wiki/contracts/configuration.md).

## 1. Configuration file named by `COPERNICA_CONFIG_FILE`

| Item | Behavior |
|------|----------|
| Variable | `COPERNICA_CONFIG_FILE`: absolute or relative path to a JSON file |
| Unset | nothing changes |
| Set, file exists | loaded as a JSON configuration source with the same hierarchy as `appsettings.json` |
| Set, file missing or invalid JSON | startup fails with a message naming the file |
| Precedence | `appsettings*.json` < **this file** < environment variables < command line |
| `_FILE` keys | resolved after this file is loaded, so `…_FILE` keys in the file work |

The 001 contract currently says settings can be placed "in `copernica.json` in the data
directory". That was never implemented. The sentence is replaced by a description of
`COPERNICA_CONFIG_FILE`.

## 2. Local account password from a file

| Item | Behavior |
|------|----------|
| New key | `Copernica:Auth:Local:Users:N:Password`, normally given as `Password_FILE` |
| Startup | a user with `Password` gets it hashed in memory, with the same hasher as `copernica hash-password`; the plain value is not kept in the options |
| Validation | each user has exactly one of `Password` or `PasswordHash`; otherwise startup fails, naming the user |
| Login | unchanged |

`PasswordHash` remains the recommended way for accounts the deployer manages. `Password`
exists so the chart can create the initial account without computing a hash
([research R3](../research.md#r3-generated-credential-initial-local-account)).

## Unchanged

There are no new ports, endpoints or outbound connections. The only file read is the
configuration file, and it is read only when the variable names it. `SECURITY.md`,
"Files", gains one line saying this.
