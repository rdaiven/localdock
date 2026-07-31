/** Minimal ANSI SGR parser: turns a raw terminal line into styled spans.
 * Handles the color/bold subset dev servers actually emit (16-color +
 * bright, bold, dim, reset); every other escape sequence is stripped. */

export interface AnsiSpan {
  text: string;
  /** CSS color, or undefined for the default log color */
  color?: string;
  bold?: boolean;
  dim?: boolean;
}

// A 16-color palette tuned to stay readable on both themes.
const COLORS: Record<number, string> = {
  30: "#7d8799", // black → render as gray, true black would vanish on dark
  31: "#ef7b7b",
  32: "#45d8a0",
  33: "#e9bd6b",
  34: "#6ca1f2",
  35: "#c792ea",
  36: "#5fd7d0",
  37: "#c8ceda",
  90: "#7d8799",
  91: "#f89a9a",
  92: "#6fe3b6",
  93: "#f0cd8a",
  94: "#8fb5f5",
  95: "#d8b0f0",
  96: "#84e2dc",
  97: "#e9edf5",
};

// CSI sequences (ESC [ ... final-byte); we interpret SGR (`m`), strip the rest.
// Also strips other escape flavors (OSC titles, single-char escapes).
// eslint-disable-next-line no-control-regex
const CSI = /\x1b\[([0-9;]*)([A-Za-z])|\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b./g;

export function parseAnsiLine(raw: string): AnsiSpan[] {
  // dev servers often emit bare \r progress redraws — keep only the final state
  const lastCr = raw.lastIndexOf("\r");
  const line = lastCr >= 0 && !raw.includes("\n") ? raw.slice(lastCr + 1) : raw;

  const spans: AnsiSpan[] = [];
  let color: string | undefined;
  let bold = false;
  let dim = false;
  let lastIndex = 0;

  const push = (text: string) => {
    if (!text) return;
    spans.push({ text, color, bold: bold || undefined, dim: dim || undefined });
  };

  for (const match of line.matchAll(CSI)) {
    push(line.slice(lastIndex, match.index));
    lastIndex = match.index + match[0].length;

    if (match[2] === "m") {
      const codes = (match[1] || "0").split(";").map((c) => parseInt(c || "0", 10));
      for (const code of codes) {
        if (code === 0) {
          color = undefined;
          bold = false;
          dim = false;
        } else if (code === 1) bold = true;
        else if (code === 2) dim = true;
        else if (code === 22) {
          bold = false;
          dim = false;
        } else if (code === 39) color = undefined;
        else if (COLORS[code]) color = COLORS[code];
        // 38;5;n / 48;… extended colors: not worth mapping — ignore gracefully
      }
    }
    // non-SGR sequences: stripped, no state change
  }
  push(line.slice(lastIndex));

  return spans.length > 0 ? spans : [{ text: "" }];
}

/** The line with every escape sequence removed — for search and copy. */
export function stripAnsi(raw: string): string {
  return parseAnsiLine(raw)
    .map((s) => s.text)
    .join("");
}
