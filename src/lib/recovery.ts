import type { AttentionReason } from "../types";

export const RECOVERY_CONFIG: Record<
  AttentionReason,
  { subtitle: string; message: string; fixLabel: string }
> = {
  "port-conflict": {
    subtitle: "Port conflict",
    message: "Something else is using this address.",
    fixLabel: "Use a free port",
  },
  "missing-deps": {
    subtitle: "Missing dependencies",
    message: "This app needs some files installed first.",
    fixLabel: "Install and retry",
  },
  "missing-env": {
    subtitle: "Missing settings",
    message: "This app needs a few settings before it can start.",
    fixLabel: "Fill in settings",
  },
  "bad-command": {
    subtitle: "Start command failed",
    message: "We're not sure how to start this.",
    fixLabel: "Edit start command",
  },
  crashed: {
    subtitle: "Stopped unexpectedly",
    message: "This app stopped unexpectedly.",
    fixLabel: "Restart",
  },
};
