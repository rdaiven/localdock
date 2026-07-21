# LocalDock

A lightweight Windows desktop app for managing your local development servers from one place — start, stop, and monitor every project without juggling a dozen terminal windows.

## What it does

If your day-to-day involves bouncing between several local dev servers (a frontend, an API, a couple of side projects), LocalDock gives you a single dashboard to control all of them:

- **Start / stop projects with one click.** Each project is just a shell command and a working directory — LocalDock runs it and manages the process for you.
- **Reliable shutdown.** Stopping a project kills its entire process tree (including anything it spawned), so you never end up with orphaned `node` processes still holding a port.
- **Live status.** Projects show as Stopped, Starting, Running, or Needs Attention, with a live console log stream for each one.
- **Smart problem detection.** LocalDock tells you *why* something needs attention — a port conflict, missing dependencies, a missing `.env` value, a bad start command, or an unexpected crash — and gives you a one-click fix (move to a free port, install deps, edit the command, edit env vars) rather than just showing a red icon.
- **Crash recovery.** If a project's process dies unexpectedly, LocalDock notices immediately and flags it instead of silently showing it as running.
- **Open in your editor.** Jump straight from a project card into VS Code, Cursor, or whatever IDE you have installed.
- **Light / dark / auto theme**, and optional launch-at-startup.

## AI / MCP integration

LocalDock also runs a local [MCP](https://modelcontextprotocol.io) server, so AI coding assistants can manage your dev environment directly — start a project, stop it, check whether a port is free, or list what's currently running, all through the same controls the GUI uses. A project started by an AI assistant shows up in the dashboard exactly like one you started by hand, and vice versa.

## Tech stack

- **Frontend:** React, TypeScript, Zustand, Tailwind CSS, Vite
- **Backend:** Rust via [Tauri 2](https://tauri.app), using Windows Job Objects for reliable process-tree lifecycle management
- **AI integration:** [`rmcp`](https://github.com/modelcontextprotocol/rust-sdk) (official Rust MCP SDK) over Streamable HTTP

## Getting started

**Prerequisites:** Node.js, Rust, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for Windows.

```bash
npm install
npm run tauri dev
```

To build a release binary:

```bash
npm run tauri build
```

## Platform

LocalDock currently targets Windows, since process-tree management is built on the Windows Job Object API.

## License

MIT
