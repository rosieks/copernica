# Feature Specification: Helm Chart for Kubernetes Deployments

**Feature Branch**: `008-helm-chart`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "trzeba ogarnac helm chart z values.yaml - tylko nie tlumacz 1:1 zmiennych srodowiskowych bo tam jest chyba glebsza hierarchia. Uwzglednij ze w przyszlosci bedzie mozna ustawic np. wlasna baze danych, wlasny pull secret, itp zeby ogolnie uzytkownik mogl okreslic rzeczy o ktorych my teraz nie pomyslimy" (We need a Helm chart with a values file. Do not translate the environment variables one to one, because the settings have a deeper hierarchy. Keep in mind that in the future people will be able to set things like their own database or their own image pull secret, so a deployer should generally be able to specify things we have not thought of now.)

**Builds on**:
- [001](../001-git-backed-team-wiki/spec.md) and its
  [configuration contract](../001-git-backed-team-wiki/contracts/configuration.md): the
  application settings, the process interface (one HTTP port, health endpoints, data
  volume) and the example Kubernetes manifests this feature replaces.
- [003](../003-paste-images/contracts/configuration.md): attachment settings, including the
  per-space override.
- [Roadmap](../../docs/roadmap.md): the Helm chart replaces the kustomize manifests in
  `deploy/kubernetes`; a setup CLI that writes values for this chart is a later feature.

## Clarifications

### Session 2026-10-23

- Q: Can the chart create Secrets from values, or must every credential be a reference to
  a Secret the deployer created? → A: The chart may generate a credential when the deployer
  provides nothing for it. A credential the deployer chooses is given only as a reference
  to their own Secret, never as a plain value.

## User Scenarios & Testing *(mandatory)*

Today a Kubernetes deployment means copying the example manifests and writing every
application setting as a flat, indexed environment variable in a Secret
(`Copernica__Spaces__1__Attachments__Path`). That is hard to read, easy to get wrong
(a wrong index or a typo is silently ignored), mixes secrets with ordinary settings, and
offers no supported way to adapt the deployment to a cluster's own conventions. This
feature ships a Helm chart. Its values file describes the wiki the way a deployer thinks
about it, with spaces, authentication and storage as nested groups. It also lets the
deployer adjust anything on the Kubernetes or application side that the chart does not
model explicitly.

The "deployer" is the administrator who installs and operates the wiki in a cluster.

### User Story 1 - Install a working wiki from a short values file (Priority: P1)

A deployer writes a values file that names the wiki's public address, chooses the
authentication mode with its settings, and lists the spaces: each space is one entry with
its identifier, display name, provider, repository address, branch, optional folder and
optional attachment location. They install the chart into a namespace and get a running
wiki with persistent storage, reachable inside the cluster, that serves those spaces.

**Why this priority**: This is the feature. Without it, nothing else in the chart matters.

**Independent Test**: Install the chart on an empty cluster with an example values file
containing two spaces and local accounts. Verify that the wiki becomes ready, both spaces
are listed, a page can be saved, and the pod passes the `restricted` Pod Security Standard.

**Acceptance Scenarios**:

1. **Given** an empty namespace that enforces the `restricted` Pod Security Standard and a
   values file with authentication and two spaces, **When** the deployer installs the
   chart, **Then** the wiki starts as a single replica with a persistent data volume,
   becomes ready, and lists both spaces.
2. **Given** a values file, **When** the deployer reads it, **Then** each setting appears
   once, in a group named after what it configures (for example, a space's attachment
   location sits inside that space's entry). No setting has to be written as an
   environment-variable name or a numeric list index.
3. **Given** the chart's default values with only the required settings filled in,
   **When** it is installed, **Then** the result uses the safest configuration: no
   exposure outside the cluster, authentication required, anonymous read off, and a
   non-root container with a read-only root filesystem and no capabilities.
4. **Given** a values file that turns on the ingress with a host name and TLS, **When** the
   chart is installed, **Then** the wiki is reachable at that host, and its public address
   is derived from the ingress unless the deployer sets it explicitly.

---

### User Story 2 - Keep secrets out of the values file (Priority: P1)

The deployer's values file is likely to be committed to their own configuration
repository. Client secrets, access tokens, read credentials for Azure DevOps and
local-account password hashes therefore stay out of it. The values file points to the
Kubernetes Secrets that hold them (a Secret name and key per credential), and the chart
passes them to the wiki without the values ever appearing in rendered ordinary resources.

**Why this priority**: Every real installation needs credentials. Putting them in a
values file would break the constitution's rule that secrets are never committed.

**Independent Test**: Install with an identity-provider client secret, a sync credential
and one space credential, each referenced from pre-created Secrets. Verify that sign-in
and synchronization work, and that no credential value appears in the rendered chart output
or in any ConfigMap.

**Acceptance Scenarios**:

1. **Given** a Secret created by the deployer and a values file that references it for the
   identity provider's client secret, **When** the chart is installed, **Then** users can
   sign in and the secret value appears in no resource other than the deployer's own Secret.
2. **Given** a space whose repository needs a credential, **When** the values file
   references a Secret key for that space's credential, **Then** the space synchronizes,
   and the reference sits inside that space's entry.
3. **Given** a values file that selects an authentication mode but leaves out a credential
   that mode requires, **When** the deployer installs, **Then** installation stops before
   any resource is created, and the message names the missing setting.
4. **Given** a values file that tries to give a credential as a plain value, **When** the
   deployer installs, **Then** installation is rejected. The message explains that a
   deployer-chosen credential is given only as a Secret reference.
5. **Given** local accounts selected and no account credentials provided at all, **When**
   the chart is installed, **Then** the chart creates one initial account with a random
   password in a Secret it owns. The installation notes say how to read the password, and
   the deployer can sign in with it.
6. **Given** a credential the chart generated, **When** the release is upgraded, **Then**
   the credential keeps its value. It is never regenerated, and users can still sign in.
7. **Given** a credential that only an external system can issue (an identity-provider
   client secret, an Azure DevOps token) and no reference to it, **When** the deployer
   installs, **Then** installation is rejected (scenario 3). The chart does not generate
   anything for it.

---

### User Story 3 - Catch mistakes before anything is deployed (Priority: P2)

A deployer makes a typo in a setting name, gives a wrong type, chooses an unknown
authentication mode, sets more than one replica, or sets a permission cache lifetime above
the allowed maximum. The chart rejects the values when they are installed or rendered,
says which setting is wrong and why, and changes nothing in the cluster.

**Why this priority**: Today, a mistyped environment variable is silently ignored and the
wiki starts with a default. A chart that catches mistakes is the main improvement over
the plain manifests, after structure itself.

**Independent Test**: Run installation against a set of values files, each containing one
common mistake. Verify that each is rejected with a message naming the setting, and that no
resource is created.

**Acceptance Scenarios**:

1. **Given** a misspelled setting inside a group the chart models (for example `brnach`
   in a space entry), **When** the deployer installs, **Then** installation is rejected and
   the message names the unknown setting and its location.
2. **Given** two spaces with the same identifier, **When** the deployer installs, **Then**
   installation is rejected with a message naming the duplicate identifier.
3. **Given** a replica count other than one, **When** the deployer installs, **Then**
   installation is rejected and the message explains that a single replica is the only
   supported topology.
4. **Given** values that pass the chart's checks but that the application rejects at
   startup, **When** the wiki starts, **Then** the pod does not become ready, and the
   application's existing startup error, visible in the pod logs, names the setting.

---

### User Story 4 - Adapt the deployment to the cluster's own conventions (Priority: P2)

Every organization's cluster has its own rules. Images come from an internal registry that
needs an image pull secret. Pods need cost-centre labels, annotations for a backup or
policy tool, a particular service account, node selectors, tolerations, resource limits,
or a storage class. Some clusters add a sidecar, an extra init step, a CA bundle
mounted as a volume, or an extra resource such as a NetworkPolicy. The deployer can set
all of this through the values file without forking the chart.

**Why this priority**: The user explicitly wants room for needs nobody has foreseen. A
chart that has to be forked to add one annotation is not adopted. These settings are
not needed for a first installation, though, so this story ranks below the first two.

**Independent Test**: Install with values that set an internal image registry with a
pull secret, extra pod labels and annotations, an extra environment variable, an extra
volume with its mount, and one extra manifest. Verify that each appears in the deployed
resources and that the pod still passes the `restricted` standard.

**Acceptance Scenarios**:

1. **Given** values naming an image registry, repository, tag or digest, and one or more
   image pull secrets, **When** the chart is installed, **Then** the pod pulls the image
   from that registry using those secrets.
2. **Given** values with extra labels and annotations for the pod, the workload, the
   service, the ingress and the volume claim, **When** the chart is installed, **Then**
   each resource carries them in addition to the chart's own labels.
3. **Given** values with scheduling and sizing settings (resources, node selector,
   tolerations, affinity, priority class, service account), **When** the chart is
   installed, **Then** the pod uses them.
4. **Given** values with extra environment variables, extra environment sources, extra
   volumes and volume mounts, extra init containers or extra sidecar containers, **When**
   the chart is installed, **Then** they are added to the pod next to the chart's own.
5. **Given** values with extra manifests (any Kubernetes resource, which may refer to the
   release's name and namespace), **When** the chart is installed, **Then** they are
   deployed and removed together with the release.
6. **Given** values that set persistence options (size, storage class, access mode, or an
   existing claim to reuse), **When** the chart is installed, **Then** the data volume uses
   them.

---

### User Story 5 - Pass application settings the chart does not know yet (Priority: P2)

A newer version of the wiki adds a setting that the installed chart version does not model
yet, or the deployer needs a rarely used setting the chart deliberately leaves out. The
deployer writes it in a free-form application-settings section of the values file, using
the same nested structure as the application's own configuration. The wiki receives it
unchanged.

**Why this priority**: This is the second half of the user's request. The application's
settings will keep growing (for example a different database, notifications, more git
platforms), and the chart must not become the bottleneck.

**Independent Test**: Set an application setting that the chart does not model, such
as the render size limit, through the free-form section. Verify that the running wiki uses
the new value.

**Acceptance Scenarios**:

1. **Given** a nested setting in the free-form application-settings section, **When** the
   chart is installed, **Then** the wiki receives that setting at the same place in its
   configuration hierarchy.
2. **Given** a free-form setting that sets the same thing as a setting the chart models,
   **When** the deployer installs, **Then** installation is rejected and the message names
   both places, so nothing is overridden silently.
3. **Given** a free-form setting that would change a setting the chart controls (the
   data directory or the listening address), **When** the deployer installs, **Then**
   installation is rejected with an explanation.

---

### User Story 6 - Upgrade and change settings safely (Priority: P3)

The deployer changes a setting, adds a space or moves to a newer chart and image. The
upgrade applies the change, restarts the wiki so the new settings take effect, and keeps
every page mirror, discussion and session key on the data volume. Uninstalling the chart
keeps the data volume unless the deployer deletes it explicitly.

**Why this priority**: Upgrades happen after installation. They matter for operating the
wiki but not for the first try.

**Independent Test**: Install, create a discussion, change a space's display name and
upgrade. Verify that the wiki restarts, shows the new name, and still has the discussion.
Uninstall and verify that the data volume still exists.

**Acceptance Scenarios**:

1. **Given** a running wiki, **When** the deployer changes any application setting or
   referenced Secret name and upgrades, **Then** the wiki restarts with the new settings
   without manual intervention.
2. **Given** a running wiki with discussions, **When** it is upgraded, **Then** all
   discussions and the users' signed-in sessions survive the restart.
3. **Given** an installed release, **When** the deployer uninstalls it, **Then** the data
   volume is kept, and the uninstall output says how to delete it.
4. **Given** a later chart version that renames or moves a setting, **When** a deployer
   upgrades with values written for the earlier version, **Then** the old setting keeps
   working for at least one minor version with a deprecation notice, or the upgrade is
   rejected with a message naming the new location. It is never silently ignored.

---

### Edge Cases

- **Namespace without the Pod Security label**: the chart does not create or label
  namespaces. The documentation shows how to label one for `restricted` enforcement, and
  the pod passes `restricted` whether or not it is enforced.
- **No spaces configured**: installation is allowed. The wiki starts with no spaces, as it
  does today, and the installation notes say how to add them.
- **No authentication mode**: installation is rejected, because the container listens on
  all interfaces inside the pod and the application refuses to start without a mode
  (001).
- **Ingress off but public address needed**: when the deployer exposes the wiki some other
  way (a gateway or load balancer they manage), they set the public address explicitly.
  The chart does not guess it.
- **Ingress with several hosts**: the public address comes from the first host. The
  deployer can override it.
- **Existing volume claim**: when the deployer names an existing claim, the chart does not
  create a claim. Uninstalling never touches the deployer's claim.
- **Referenced Secret missing**: the pod does not start, and the Kubernetes event names the
  missing Secret. The chart does not invent credentials.
- **Very large space list**: one hundred spaces install without hitting resource size
  limits.
- **Free-form section containing secrets**: the documentation warns that the free-form
  section is not secret. Secret-valued settings that the chart does not model go through
  the extra environment sources from Secrets (User Story 4).
- **Migrating from the kustomize manifests**: the documentation shows how to reuse the
  existing data volume claim, so pages, discussions and sessions are kept.

## Requirements *(mandatory)*

### Functional Requirements

**Structure and defaults**

- **FR-001**: The project MUST ship a Helm chart that deploys a working wiki: a
  single-replica workload, a service, a persistent data volume, and an optional ingress
  that is off by default.
- **FR-002**: Application settings in the values file MUST be organized as nested groups
  that follow the meaning of the settings: general settings, authentication with one group
  per mode, Azure DevOps, attachments, and spaces as a list of entries with named fields,
  where per-space settings (attachments, credential) sit inside the space entry. Settings
  MUST NOT be written as environment-variable names or indexed keys.
- **FR-003**: The chart MUST model every setting in the 001 and 003 configuration
  contracts, except settings that the chart controls itself (data directory and listening
  address) and settings marked rarely used in the plan, which remain available through
  FR-013.
- **FR-004**: The chart's default values MUST produce the safest configuration (no
  exposure outside the cluster, authentication required, anonymous read off), and the
  rendered pod MUST satisfy the `restricted` Pod Security Standard with a read-only root
  filesystem, no added capabilities, a non-root user, and no service account token mounted
  unless the deployer asks for one.
- **FR-005**: Every value MUST be documented in the values file, with its default and an
  example, and the chart MUST include example values files for at least local accounts,
  Microsoft Entra ID with Azure DevOps Services, and generic OIDC with Azure DevOps Server.

**Secrets**

- **FR-006**: Every credential (identity-provider client secret, Azure DevOps sync
  credential, per-space credential, local-account password hash) MUST be configurable as a
  reference to a key in an existing Kubernetes Secret, placed in the same group as the
  setting it belongs to.
- **FR-007**: Credential values MUST NOT appear in any rendered ConfigMap, annotation,
  label or other non-Secret resource.
- **FR-008**: Credentials MUST NOT be accepted as plain values. A credential the deployer
  chooses is given only as a Secret reference (FR-006). When the deployer provides nothing
  for a credential the wiki itself owns, the chart MUST generate a random value and store
  it in a Secret owned by the release. Today, the wiki owns only the initial local account
  password; credentials issued by external systems are never generated. A generated value
  MUST stay the same across upgrades, and the installation notes MUST say how to read it.

**Validation**

- **FR-009**: The chart MUST validate values when it is installed, upgraded or rendered,
  and reject invalid values before any resource is created, with a message naming the
  setting. This covers at least unknown settings inside modeled groups, wrong types,
  unknown enumerations, a missing required setting for the chosen authentication mode,
  duplicate space identifiers, a replica count other than one, and a permission cache
  lifetime above five minutes.
- **FR-010**: Validation MUST NOT reject unknown keys inside the free-form sections
  (FR-012, FR-013).

**Extension points**

- **FR-011**: The deployer MUST be able to set, through values, the image (registry,
  repository, tag or digest, pull policy), image pull secrets, the service account
  (create, name, annotations), extra labels and annotations per resource, pod and
  container security context additions, resources, node selector, tolerations, affinity,
  topology spread constraints, priority class, probe timings, the service type, port and
  annotations, ingress class, hosts, paths, TLS and annotations, and persistence options
  (size, storage class, access mode, existing claim, annotations).
- **FR-012**: The deployer MUST be able to add extra environment variables, extra
  environment sources (Secrets or ConfigMaps), extra volumes, extra volume mounts, extra
  init containers, extra sidecar containers and extra manifests. Extra manifests MAY refer
  to release values such as the release name and namespace.
- **FR-013**: The values file MUST contain a free-form application-settings section whose
  nested content is passed to the application unchanged, at the same place in its
  configuration hierarchy.
- **FR-014**: A free-form setting that conflicts with a setting the chart models, or with
  a setting the chart controls, MUST be rejected at install time with a message naming
  both places.
- **FR-015**: The values layout MUST leave room for future groups (for example a database,
  notifications or more git platforms) to be added as new groups without renaming or
  moving existing settings.

**Lifecycle**

- **FR-016**: A change to any application setting or Secret reference MUST restart the
  wiki on upgrade. Restarts MUST stop the old pod before starting the new one, so that only
  one instance uses the data volume at a time.
- **FR-017**: Uninstalling MUST keep the data volume by default, and the uninstall notes
  MUST say how to delete it.
- **FR-018**: The chart MUST follow semantic versioning. A setting that is renamed or moved
  MUST keep working with a deprecation notice for at least one minor version, or be
  rejected with a message naming its new location. It MUST NOT be silently ignored.
- **FR-019**: After installation, the chart MUST show notes saying how to reach the wiki,
  which public address it uses, and which settings still need attention (for example no
  spaces configured).

**Project integration**

- **FR-020**: The chart MUST replace the kustomize manifests in `deploy/kubernetes`. The
  README, `SECURITY.md` and the configuration contract MUST be updated to describe the
  chart, including how to render plain manifests with the chart for deployers who apply
  manifests without Helm, and how to migrate an existing installation without losing data.
- **FR-021**: The chart MUST install and render without network access, from the
  repository or from a packaged chart file, with all of its content inside the package.
  No chart dependencies are pulled from public repositories.
- **FR-022**: Continuous integration MUST check the chart. That means linting, rendering
  the defaults and every example values file, validating the rendered resources against
  the Kubernetes schemas and the `restricted` standard, running the set of invalid values
  files from FR-009, and installing the chart on a disposable cluster to confirm the wiki
  becomes ready.

### Key Entities

- **Chart**: The versioned, installable package for Kubernetes. It has its own version and
  the version of the wiki it deploys by default.
- **Values file**: The deployer's description of an installation. It has modeled groups
  (application settings, Kubernetes resources) and free-form sections (extra resources,
  extra application settings).
- **Secret reference**: A pointer from a setting to a key in a Kubernetes Secret that the
  deployer manages.
- **Space entry**: One item in the values file's list of spaces. It holds the space's
  identifier, display name, provider, repository address, branch, folder, attachment
  location and credential reference.
- **Release**: One installation of the chart in a namespace. It owns the workload, the
  service, the optional ingress, the volume claim it created, and any extra manifests.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A deployer with a cluster, a namespace and an identity-provider registration
  installs a wiki serving three spaces in under 15 minutes using only the chart's
  documentation. 001 SC-001 targets 30 minutes for the manual setup.
- **SC-002**: A values file for a typical installation (Entra ID, Azure DevOps, three
  spaces) needs at most half as many lines as the equivalent environment-variable Secret
  today, and contains no numeric index.
- **SC-003**: 100% of the settings in the 001 and 003 configuration contracts can be set
  through the values file, either as modeled settings or through the free-form section.
- **SC-004**: Each of a test set of at least ten common mistakes is rejected before any
  resource is created, with a message that names the setting.
- **SC-005**: 0 rendered resources violate the `restricted` Pod Security Standard, with
  default values or with any example values file.
- **SC-006**: 0 credential values appear in rendered non-Secret resources, across all
  example values files.
- **SC-007**: After an upgrade with changed settings, 100% of pages, discussions and
  signed-in sessions are retained, and the wiki is ready again within 2 minutes.
- **SC-008**: Each of the needs named in User Story 4 (internal registry with pull secret,
  extra labels and annotations, extra volume, sidecar, extra manifest) and one application
  setting the chart does not model can be met without changing the chart.

## Assumptions

- **Kustomize manifests are removed.** The project owner does not use kustomize (roadmap
  decision), so the Helm chart is the only supported Kubernetes deployment. Deployers who
  apply plain manifests render them from the chart.
- **Single replica stays.** Horizontal scaling remains out of scope (Constitution V). The
  replica count is effectively fixed, and autoscaling is not offered.
- **Own database and similar future options.** The application stores non-content data in
  an embedded database today, and the constitution does not allow an external database
  without an amendment. This feature does not add a database setting. It keeps the values
  layout open for one (FR-015). Until then, any new application setting is reachable through
  the free-form section (FR-013), and connection secrets through extra environment sources
  (FR-012).
- **Namespaces are the deployer's.** The chart installs into the namespace it is given and
  does not create or label namespaces.
- **Publishing.** The chart is kept in the repository and can be packaged into a single
  file for offline transfer. A pipeline that publishes the chart to a registry belongs
  with versioned releases (roadmap, "Before a wider rollout") and is out of scope here.
  So is publishing the container image.
- **Default image.** Without image settings, the chart deploys the image name the project
  builds today, tagged with the wiki version the chart was released with. Real
  installations are expected to set their own registry.
- **Application configuration model unchanged.** The application keeps its settings and
  its precedence rules. How the chart hands settings to it is a planning decision,
  provided FR-002, FR-007 and FR-013 hold. The plan adds two small additive changes: a
  configuration file named by an environment variable, and a local-account password read
  from a file for the generated initial account
  ([contracts/application.md](contracts/application.md)).
- **Validation split.** The chart checks structure and the rules listed in FR-009. Checks
  that need the application itself (for example whether an attachment path stays inside
  the space) remain at application startup, as they are today.
- **Setup CLI later.** A command that generates values files interactively is a separate
  roadmap item that builds on this chart's values layout.
