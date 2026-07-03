export function applyLineRange(text: string, lines?: string): string {
  if (!lines) return text;
  const match = /^(\d+)(?:-(\d+))?$/.exec(lines.trim());
  if (!match) return text;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  const allLines = text.split("\n");
  return allLines.slice(start - 1, end).join("\n");
}

export const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "ts",
  tsx: "tsx",
  js: "js",
  jsx: "jsx",
  mjs: "js",
  cjs: "js",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  rb: "ruby",
  php: "php",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  sh: "bash",
  bash: "bash",
  md: "markdown",
  mdx: "markdown",
  html: "html",
  css: "css",
  scss: "scss",
  sql: "sql",
  kt: "kotlin",
  swift: "swift",
  xml: "xml",
  dockerfile: "dockerfile",
};

export function languageFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dotIndex = base.lastIndexOf(".");
  const ext = (dotIndex === -1 ? base : base.slice(dotIndex + 1)).toLowerCase();
  return LANGUAGE_BY_EXTENSION[ext] ?? ext ?? "text";
}
