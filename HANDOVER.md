# LocalDock — Handover

Snapshot of project state as of **2026-08-05**, current version **v0.1.2**.
For user-facing docs see [README.md](README.md); for release history see
[CHANGELOG.md](CHANGELOG.md). This file is for whoever (human or AI) picks
up the project next — it captures state and *why*, not just what.

## What LocalDock is

A Windows desktop app (Tauri 2 + React/TypeScript) that starts, stops, and
monitors local dev servers from one dashboard, with full process-tree
lifecycle management via Windows Job Objects, and a local MCP server so AI
coding assistants can manage the same dev servers directly.

## Release state

- **Latest tagged release: v0.1.2** — https://github.com/rdaiven/localdock/releases/tag/v0.1.2
- Shipped feature set: log viewer, live CPU/RAM/uptime, script chips,
  auto-restart, project groups with start-all/stop-all, tray controls,
  crash notifications, 8 MCP tools, auto-updates, changelog-driven release
  notes. Full detail in [CHANGELOG.md](CHANGELOG.md).
- Release process: push a `v*` tag → `.github/workflows/release.yml` builds
  the NSIS installer, signs updater artifacts, and publishes a GitHub
  Release whose body is pulled from the matching `## [x.y.z]` section of
  `CHANGELOG.md`. Bump the three version fields (`package.json`,
  `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`) and add a changelog
  entry before tagging.

## Auto-updates

`tauri-plugin-updater` checks `https://github.com/rdaiven/localdock/releases/latest/download/latest.json`.
Updater artifacts are signed with a dedicated ed25519 keypair (**not** used
for anything else):

- Public key lives in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).
- Private key + password are stored as GitHub Actions repo secrets
  (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) —
  **not committed anywhere**. If they're ever lost, existing installs can
  no longer verify future updates; a new keypair would need generating and
  every user would need to reinstall manually once to pick up the new
  public key.
- Verified live end-to-end on 2026-08-05: a real installed v0.1.2 build
  correctly fetched and signature-checked `latest.json` and reported
  itself as current.

## winget submission — IN PROGRESS

- PR open: **https://github.com/microsoft/winget-pkgs/pull/412703**
  ("New package: DaivenReyes.LocalDock version 0.1.2")
- Package identifier: `DaivenReyes.LocalDock`
- Manifests live on a branch of a fork: `rdaiven/winget-pkgs`, branch
  `add-DaivenReyes.LocalDock-0.1.2`, under
  `manifests/d/DaivenReyes/LocalDock/0.1.2/`
- Status as of 2026-08-05: CLA signed, automated validation passed
  (`Azure-Pipeline-Passed`, `Validation-Completed` labels present).
  **Blocked only on a human moderator review** — no action pending on our
  side. Typical turnaround is days to a few weeks.
- If a moderator requests manifest changes: edit the files on the
  `add-DaivenReyes.LocalDock-0.1.2` branch of `rdaiven/winget-pkgs` (via
  the GitHub contents API or a local clone) and push — the PR updates
  automatically, no need to open a new one.
- If/when a new LocalDock version ships, a **separate** winget PR is
  needed per version (add a new `manifests/.../<version>/` directory with
  updated `PackageVersion`, `InstallerUrl`, and `InstallerSha256`).

## Deliberately not done yet

- **Code signing (Authenticode)** — the installer is unsigned, so Windows
  SmartScreen shows an "unrecognized publisher" warning. Requires buying a
  code-signing certificate under Daiven's identity; not something an
  agent can do autonomously. Revisit if this becomes a real adoption
  blocker.
- **Chocolatey submission** — same category of decision as winget (public
  submission under the maintainer's identity); held off pending explicit
  ask, same as winget was until this session.

## Known rough edges

- There's a stale "src-tauri" project entry some users' local
  `projects.json` may still have from before the self-discovery fix
  landed (`src-tauri/src/discover.rs`, `own_pid` exclusion) — harmless,
  removable via the project's "…" menu, will never reappear.
