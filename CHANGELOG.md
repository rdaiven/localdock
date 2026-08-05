# Changelog

All notable changes to LocalDock are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Auto-updates: LocalDock checks GitHub Releases for a newer signed build
  and can install it in place from Settings → Updates.

### Changed
- Reworked the README with a clearer feature breakdown and a full MCP tool
  reference table.
- Hardened `.gitignore` against accidental `.env`/OS-cruft commits.

## [0.1.1] - 2026-08-03

### Added
- Full-panel log viewer with live filtering, copy, and a 2000-line
  scrollback per project.
- Live CPU, RAM, and uptime stats per running project.
- Clickable script chips sourced from a project's `package.json`.
- Opt-in auto-restart with capped exponential backoff after a crash.
- Project groups with sequenced **Start all** / parallel **Stop all**.
- Tray menu with a live per-project start/stop toggle.
- OS notifications on an unexpected stop and when auto-restart gives up.
- MCP tools: `restart_project`, `list_projects`, `get_console_output`,
  `add_project`, `scan_for_servers`.

### Fixed
- LocalDock no longer discovers its own MCP server process as an addable
  project.

## [0.1.0] - 2026-07-31

Initial public release: start/stop/monitor local dev servers from one
dashboard, with system tray support, dev-server discovery, and an MCP
server for AI assistants.

[Unreleased]: https://github.com/rdaiven/localdock/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/rdaiven/localdock/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/rdaiven/localdock/releases/tag/v0.1.0
