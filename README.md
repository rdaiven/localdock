# LocalDock

A lightweight Windows desktop app for managing your local dev servers from one place — start, stop, and monitor every project without juggling a dozen terminal windows.

## What it does

If your day-to-day involves bouncing between several local dev servers (a frontend, an API, a couple of side projects), LocalDock gives you a single dashboard to control all of them:

- **Start / stop projects with one click.** Each project is just a shell command and a working directory — LocalDock runs it and manages the process for you.
- **Reliable shutdown.** Stopping a project kills its entire process tree (via Windows Job Objects), so you never end up with orphaned `node` processes still holding a port.
- **Live status at a glance.** Every project row carries a glowing status edge — green while running, amber while starting, red when something needs attention — plus live console output and an activity log.
- **Finds servers you started elsewhere.** One click scans your machine for dev servers already running outside LocalDock (started by hand, or by an AI assistant's terminal), figures out which folder each one belongs to, and offers to add it.
- **Smart problem detection.** Port conflicts, missing dependencies, bad start commands, and crashes are diagnosed with a one-click fix — not just a red icon.
- **Lives in your tray.** Close the window and LocalDock keeps managing your servers from the system tray (toggleable — you can make the close button really quit instead). Optional start-on-login and start-minimized.
- **Projects persist.** Your project list survives restarts; nothing to reconfigure.
- **Open in your editor or a terminal.** Jump from a project row into VS Code, Cursor, or a terminal in that folder.

## AI / MCP integration

LocalDock runs a local [MCP](https://modelcontextprotocol.io) server, so AI coding assistants can manage your dev environment directly — start a project, stop it, check whether a port is free, or list what's running, all through the same controls the GUI uses. A project started by an AI assistant shows up in the dashboard exactly like one you started by hand, and vice versa.

Copy the ready-made config from **Settings → AI & MCP** into your assistant's MCP settings:

```json
{ "mcpServers": { "localdock": { "url": "http://127.0.0.1:7420/mcp" } } }
```

## Install

Grab the installer from the [latest release](https://github.com/rdaiven/localdock/releases/latest), run it, done.

## Building from source

**Prerequisites:** Node.js, Rust, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for Windows.

```bash
npm install
npm run tauri dev
```

To build a release installer:

```bash
npm run tauri build
```

## Tech stack

- **Frontend:** React, TypeScript, Zustand, Framer Motion, Vite, and a hand-written design system
- **Backend:** Rust via [Tauri 2](https://tauri.app), using Windows Job Objects for process-tree lifecycle management
- **AI integration:** [`rmcp`](https://github.com/modelcontextprotocol/rust-sdk) (official Rust MCP SDK) over Streamable HTTP

## Platform

LocalDock currently targets Windows, since process-tree management is built on the Windows Job Object API.

## License

MIT
