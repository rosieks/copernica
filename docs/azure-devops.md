# Using Copernica with Azure DevOps

Copernica serves wiki spaces from Azure DevOps git repositories. Users sign in with the same
identity they use for Azure DevOps. The wiki then:

- asks Azure DevOps what each user may do, using that user's own token, and
- pushes each user's edits with their own token.

As a result, repository permissions and branch policies are enforced by Azure DevOps, not by
the wiki.

| Platform | Sign-in | Acting on the user's behalf |
|----------|---------|-----------------------------|
| Azure DevOps Services (`dev.azure.com`) | Microsoft Entra ID (`Auth:Mode=EntraId`) | Delegated Entra token |
| Azure DevOps Server (on-premises) | Organization OIDC provider or local accounts | Personal access token registered by each user (see below) |

## Azure DevOps Services

### 1. Register an application in Microsoft Entra ID

1. Open **Entra ID → App registrations → New registration**.
2. Choose **Accounts in this organizational directory only**.
3. Add a redirect URI of type **Web**: `https://<your wiki host>/signin-oidc`.
4. Under **Certificates & secrets**, create a client secret.
5. Under **API permissions → Add a permission → Azure DevOps**, add the delegated
   permission **user_impersonation**. Grant admin consent if your tenant requires it.

### 2. Create a read-only sync identity

Copernica keeps a copy of each repository on its data volume and refreshes it every minute.
This background fetch needs one identity with **read access only**. Choose one of:

- **Personal access token** with scope *Code: Read*, created by a service account.
- **Service principal**: the app from step 1 or a separate one, added to the Azure DevOps
  organization with *Reader* access to the repositories.
- **Managed identity**: when the wiki runs in Azure.

The sync identity is never used to write, and never used to decide what a user may see.

### 3. Configure Copernica

```text
Copernica__PublicBaseUrl=https://wiki.example.internal
Copernica__Auth__Mode=EntraId
Copernica__Auth__EntraId__TenantId=<tenant id>
Copernica__Auth__EntraId__ClientId=<application id>
Copernica__Auth__EntraId__ClientSecret_FILE=/run/secrets/entra-client-secret

Copernica__AzureDevOps__SyncCredential__Type=Pat            # or ServicePrincipal / ManagedIdentity
Copernica__AzureDevOps__SyncCredential__Pat_FILE=/run/secrets/ado-sync-pat
# ServicePrincipal: ...__TenantId, ...__ClientId, ...__ClientSecret
# ManagedIdentity:  ...__ManagedIdentityClientId (empty for system-assigned)

Copernica__Spaces__0__Id=handbook
Copernica__Spaces__0__DisplayName=Team Handbook
Copernica__Spaces__0__Provider=AzureDevOps
Copernica__Spaces__0__RemoteUrl=https://dev.azure.com/contoso/Platform/_git/handbook
Copernica__Spaces__0__Branch=main
```

### What users see

- **Spaces:** a user sees a space only if they can read its repository in Azure DevOps.
  Permission changes in Azure DevOps take effect in the wiki within 2 minutes (setting
  `PermissionCacheTtl`, maximum 5 minutes).
- **Editing:** offered only to users who can contribute to the space's branch.
- **Saving:** each save is pushed as the user. If a branch policy requires pull requests,
  saving is rejected and the user sees the reason. Spaces meant for direct editing should
  use a branch without required reviewers.
- **Expired access:** when a user's token expires or is revoked, the wiki asks them to sign
  in again.

### Data and network

- **Tokens:** stored only on the server, in the wiki database, encrypted with ASP.NET Core
  Data Protection (keys under `<DataDirectory>/keys`). They are deleted when the user signs
  out.
- **Outbound connections:** the wiki connects only to `login.microsoftonline.com` (or your
  `Instance`) and to the Azure DevOps hosts named in `RemoteUrl`.

## Azure DevOps Server (on-premises)

Azure DevOps Server does not accept Microsoft Entra delegated tokens. To use it:

1. Set `Copernica__AzureDevOps__Server__UserPat=true`.
2. Configure sign-in:
   - `Copernica__Auth__Mode=Oidc` with your organization's OIDC provider (e.g. AD FS):
     `Copernica__Auth__Oidc__Authority`, `__ClientId`, `__ClientSecret`; or
   - `Copernica__Auth__Mode=Local` for small installations.
3. Ask each user to create a personal access token with scope *Code: Read & Write* and
   register it on their **Profile** page in the wiki. The token is stored encrypted and is
   used only for that user's requests.

Space URLs have the form `https://<server>/<collection>/<project>/_git/<repository>`.
