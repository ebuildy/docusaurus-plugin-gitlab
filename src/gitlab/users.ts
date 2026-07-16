/**
 * `show`-token and role helpers shared by the user fetchers (Node) and the
 * user components (browser bundle). Keep this module pure — no Node, gitbeaker,
 * or fetcher imports — so Docusaurus can bundle it for the browser.
 */

export const USER_SHOW_TOKENS = ["org", "location", "bio", "counts", "since", "role"] as const;
export type UserShowToken = (typeof USER_SHOW_TOKENS)[number];

/** Tokens whose card section needs the full user profile (GET /users/:id). */
const PROFILE_TOKENS: readonly UserShowToken[] = ["org", "location", "bio", "counts", "since"];

export const DEFAULT_USER_SHOW = "org,location,bio,counts,since";
export const DEFAULT_USERS_SHOW = "role";

type UserComponent = "GitlabUser" | "GitlabUsers";

/** Parse + validate a `show` attribute into tokens; applies the per-component default. */
export function parseShow(value: unknown, component: UserComponent): UserShowToken[] {
  const raw =
    value === undefined ? (component === "GitlabUser" ? DEFAULT_USER_SHOW : DEFAULT_USERS_SHOW) : value;
  if (typeof raw !== "string") {
    throw new Error(
      `@ebuildy/docusaurus-plugin-gitlab: <${component}> "show" must be a comma-separated string; ` +
        `got ${JSON.stringify(value)}.`,
    );
  }
  const tokens = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const token of tokens) {
    if (!(USER_SHOW_TOKENS as readonly string[]).includes(token)) {
      throw new Error(
        `@ebuildy/docusaurus-plugin-gitlab: <${component}> "show" token ${JSON.stringify(token)} ` +
          `is not one of ${USER_SHOW_TOKENS.join(", ")}.`,
      );
    }
    if (token === "role" && component === "GitlabUser") {
      throw new Error(
        `@ebuildy/docusaurus-plugin-gitlab: <GitlabUser> "show" does not support "role" (members lists only).`,
      );
    }
  }
  return tokens as UserShowToken[];
}

/** True when any requested section needs the full user profile (drives enrichment). */
export function needsProfile(tokens: readonly UserShowToken[]): boolean {
  return tokens.some((t) => PROFILE_TOKENS.includes(t));
}

/** GitLab numeric access levels → role names (see the members API docs). */
const ROLE_BY_ACCESS_LEVEL: Record<number, string> = {
  5: "minimal",
  10: "guest",
  15: "planner",
  20: "reporter",
  30: "developer",
  40: "maintainer",
  50: "owner",
};

const ROLE_NAMES = Object.values(ROLE_BY_ACCESS_LEVEL);

export function roleName(accessLevel: number): string {
  return ROLE_BY_ACCESS_LEVEL[accessLevel] ?? String(accessLevel);
}

/** Validate the `role` attribute (case-insensitive); undefined = no filter. */
export function parseRole(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const role = String(value).toLowerCase();
  if (!ROLE_NAMES.includes(role)) {
    throw new Error(
      `@ebuildy/docusaurus-plugin-gitlab: <GitlabUsers> "role" must be one of ${ROLE_NAMES.join(", ")}; ` +
        `got ${JSON.stringify(value)}.`,
    );
  }
  return role;
}
