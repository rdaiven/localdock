import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { join, basename } from "@tauri-apps/api/path";

export interface DetectionResult {
  detected: boolean;
  framework: string;
  startCommand: string;
  port: number;
  name: string;
}

export const FRAMEWORK_OPTIONS = [
  "Next.js",
  "React",
  "Vue",
  "Nuxt",
  "Angular",
  "Astro",
  "Svelte",
  "Laravel",
  "WordPress",
  "PHP",
  "Node",
  "Python",
  "Go",
  "Rust",
  "Static HTML",
  "Custom",
];

const PORT_DEFAULTS: Record<string, number> = {
  "Next.js": 3000,
  React: 5173,
  Vue: 5173,
  Nuxt: 3000,
  Angular: 4200,
  Astro: 4321,
  Svelte: 5173,
  Node: 3000,
  Laravel: 8000,
  WordPress: 8080,
  PHP: 8000,
  Python: 8000,
  Go: 8080,
  Rust: 8080,
  "Static HTML": 3000,
  Custom: 3000,
};

// Priority order of npm script names that plausibly start a dev server.
const DEV_SCRIPT_NAMES = ["dev", "start", "serve", "develop", "watch"];

// Subcommand names a bin-style CLI's own --help/usage text might document,
// checked in the same priority order as DEV_SCRIPT_NAMES above.
const CLI_DEV_SUBCOMMANDS = DEV_SCRIPT_NAMES;

async function pathExists(folder: string, file: string): Promise<boolean> {
  try {
    return await exists(await join(folder, file));
  } catch {
    return false;
  }
}

/**
 * Last-resort fallback: no build tool, no framework, no CLI — just an
 * index.html sitting in the folder. That's not "undetected", it's a plain
 * static site, and it just needs any static file server pointed at it.
 */
async function staticSiteFallback(folderPath: string, name: string): Promise<DetectionResult | null> {
  if (!(await pathExists(folderPath, "index.html"))) return null;
  const port = PORT_DEFAULTS["Static HTML"];
  return { detected: true, framework: "Static HTML", startCommand: `npx serve -l ${port}`, port, name };
}

interface CliDevGuess {
  subcommand: string;
  port?: number;
}

/**
 * A package.json `bin` entry isn't a web app — it's a CLI tool, and the
 * command that actually starts a dev server lives in the CLI's own usage
 * text, not in package.json. Read the bin file's source and look for a line
 * that looks like a documented subcommand (e.g. "  dev   Start a dev
 * server..."), the same way a `--help` listing would render it, plus any
 * documented default port for a `--port` flag.
 *
 * This is still just a guess about which subcommand exists — it can't know
 * whether *this* directory is something that subcommand can actually run
 * against (e.g. the CLI's own source repo vs. a project meant to consume
 * it), so callers should treat the result as unconfirmed.
 */
async function guessCliDev(folderPath: string, binRelPath: string): Promise<CliDevGuess | null> {
  try {
    const filePath = await join(folderPath, binRelPath);
    if (!(await pathExists(folderPath, binRelPath))) return null;
    const src = await readTextFile(filePath);
    let subcommand: string | null = null;
    for (const line of src.split("\n")) {
      const match = line.match(/^\s{2,}([a-z][\w-]*)\b/);
      if (match && CLI_DEV_SUBCOMMANDS.includes(match[1])) {
        subcommand = match[1];
        break;
      }
    }
    if (!subcommand) return null;
    const portMatch = src.match(/--port[^)]*default\s+(\d+)/i);
    return { subcommand, port: portMatch ? Number(portMatch[1]) : undefined };
  } catch {
    return null;
  }
}

export async function detectProject(folderPath: string): Promise<DetectionResult> {
  const name = (await basename(folderPath).catch(() => "")) || folderPath;

  if (await pathExists(folderPath, "package.json")) {
    let pkg: Record<string, unknown> = {};
    try {
      const raw = await readTextFile(await join(folderPath, "package.json"));
      pkg = JSON.parse(raw);
    } catch {
      // fall through with an empty package descriptor; still a detected Node project
    }
    const deps: Record<string, string> = {
      ...((pkg.dependencies as Record<string, string>) ?? {}),
      ...((pkg.devDependencies as Record<string, string>) ?? {}),
    };
    const scripts = (pkg.scripts as Record<string, string>) ?? {};

    let framework = "Node";
    if (deps["next"]) framework = "Next.js";
    else if (deps["nuxt"] || deps["nuxt3"]) framework = "Nuxt";
    else if (deps["@angular/core"]) framework = "Angular";
    else if (deps["astro"]) framework = "Astro";
    else if (deps["svelte"]) framework = "Svelte";
    else if (deps["vue"]) framework = "Vue";
    else if (deps["react"]) framework = "React";

    const packageManagerField = typeof pkg.packageManager === "string" ? pkg.packageManager : "";
    const manager = packageManagerField.startsWith("pnpm")
      ? "pnpm"
      : packageManagerField.startsWith("yarn")
        ? "yarn"
        : (await pathExists(folderPath, "pnpm-lock.yaml"))
          ? "pnpm"
          : (await pathExists(folderPath, "yarn.lock"))
            ? "yarn"
            : "npm";

    const port = PORT_DEFAULTS[framework] ?? 3000;
    const script = DEV_SCRIPT_NAMES.find((s) => scripts[s]);
    if (script) {
      return { detected: true, framework, startCommand: `${manager} run ${script}`, port, name };
    }

    // No script that looks like a dev server. If this package ships a CLI
    // (a `bin` entry), it's a tool with its own subcommands, not a webapp —
    // read its usage text instead of guessing "npm run dev" and being wrong.
    const binField = pkg.bin as string | Record<string, string> | undefined;
    const binRelPath = typeof binField === "string" ? binField : Object.values(binField ?? {})[0];
    if (binRelPath) {
      const guess = await guessCliDev(folderPath, binRelPath);
      if (guess) {
        // Confirmed the subcommand exists, but not that this folder is
        // something it can actually run against — surface it as a
        // best-effort suggestion (detected: false) rather than a confident
        // answer, so the UI asks the user to double-check it.
        return {
          detected: false,
          framework,
          startCommand: `node ${binRelPath} ${guess.subcommand}`,
          port: guess.port ?? port,
          name,
        };
      }
      return (await staticSiteFallback(folderPath, name)) ?? { detected: false, framework, startCommand: "", port, name };
    }

    // A package.json with no recognizable script and no bin entry — don't
    // pretend we know how this runs, unless there's a plain index.html to fall back to.
    return (await staticSiteFallback(folderPath, name)) ?? { detected: false, framework, startCommand: "", port, name };
  }

  if (await pathExists(folderPath, "wp-config.php")) {
    return { detected: true, framework: "WordPress", startCommand: "php -S localhost:8080", port: 8080, name };
  }

  if (await pathExists(folderPath, "composer.json")) {
    if (await pathExists(folderPath, "artisan")) {
      return { detected: true, framework: "Laravel", startCommand: "php artisan serve", port: 8000, name };
    }
    return { detected: true, framework: "PHP", startCommand: "php -S localhost:8000", port: 8000, name };
  }

  if (await pathExists(folderPath, "go.mod")) {
    return { detected: true, framework: "Go", startCommand: "go run .", port: 8080, name };
  }

  if (await pathExists(folderPath, "Cargo.toml")) {
    return { detected: true, framework: "Rust", startCommand: "cargo run", port: 8080, name };
  }

  if ((await pathExists(folderPath, "pyproject.toml")) || (await pathExists(folderPath, "requirements.txt"))) {
    if (await pathExists(folderPath, "manage.py")) {
      return { detected: true, framework: "Python", startCommand: "python manage.py runserver", port: 8000, name };
    }
    if (await pathExists(folderPath, "app.py")) {
      return { detected: true, framework: "Python", startCommand: "python app.py", port: 8000, name };
    }
    if (await pathExists(folderPath, "main.py")) {
      return { detected: true, framework: "Python", startCommand: "python main.py", port: 8000, name };
    }
    return (
      (await staticSiteFallback(folderPath, name)) ?? { detected: false, framework: "Python", startCommand: "", port: 8000, name }
    );
  }

  return (await staticSiteFallback(folderPath, name)) ?? { detected: false, framework: "Custom", startCommand: "", port: 3000, name };
}
