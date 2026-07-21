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
  Custom: 3000,
};

async function pathExists(folder: string, file: string): Promise<boolean> {
  try {
    return await exists(await join(folder, file));
  } catch {
    return false;
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

    const script = scripts.dev ? "dev" : scripts.start ? "start" : null;
    const startCommand = script
      ? `${manager} run ${script}`
      : `${manager} install && ${manager} run dev`;

    return { detected: true, framework, startCommand, port: PORT_DEFAULTS[framework] ?? 3000, name };
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
    return { detected: true, framework: "Python", startCommand: "python app.py", port: 8000, name };
  }

  return { detected: false, framework: "Custom", startCommand: "", port: 3000, name };
}
