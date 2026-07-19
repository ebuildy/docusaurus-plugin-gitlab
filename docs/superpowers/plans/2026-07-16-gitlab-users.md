# GitlabUser & GitlabUsers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two build-time MDX components — `<GitlabUser name="...">` (one user profile card) and `<GitlabUsers group|project="..." role="...">` (a cards grid of group/project members) — per the approved spec `docs/superpowers/specs/2026-07-16-gitlab-users-design.md`.

**Architecture:** Follows the existing pipeline exactly: `registry → fetcher → inject → pure component`. A `show` attribute picks card sections on both components; on `GitlabUsers` it also drives **enrich-on-demand** (profile sections trigger one memoized `GET /users/:id` per member; identity + role need only the members call). Layout reuses `ComponentLayout` + `cardsGridStyle` from `src/components/layout.ts`.

**Tech Stack:** TypeScript ESM (`.js` import extensions mandatory), gitbeaker (`Users`, `GroupMembers`, `ProjectMembers` — verified present with `includeInherited`), Vitest + React Testing Library, e2e via the local GitLab stub in `test/e2e/fixtures.ts`.

**Conventions that apply to every task:**

- All commits are GPG-signed automatically (`commit.gpgsign=true`). Verify with `git log -1 --format="%G?"` → `G`.
- ESM: intra-package imports use explicit `.js` extensions.
- gitbeaker responses are snake_case; normalize to camelCase in fetchers.
- Components are pure (`error → Fallback; !data → null; else render`), no hooks/fetching, plain global class names, no CSS module imports, **no `Map`/`Set` iterator spreads**.
- After each task: run the named tests. After the last code task also run `pnpm run typecheck`.

---

## Task 1: Shared user helpers (`src/gitlab/users.ts`) + `UserData` type

The `show`-token and role helpers are shared by the fetchers (Node) and the components (browser bundle), so defaults and enrichment triggers cannot drift apart. The module must stay **pure** — no Node, gitbeaker, or fetcher imports.

**Files:**

- Create: `src/gitlab/users.ts`
- Create: `src/gitlab/users.test.ts`
- Modify: `src/gitlab/types.ts` (append `UserData`)

- [ ] **Step 1: Write the failing test**

Create `src/gitlab/users.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseShow, needsProfile, roleName, parseRole } from "./users";

describe("parseShow", () => {
  it("applies per-component defaults", () => {
    expect(parseShow(undefined, "GitlabUser")).toEqual(["org", "location", "bio", "counts", "since"]);
    expect(parseShow(undefined, "GitlabUsers")).toEqual(["role"]);
  });

  it("parses a comma-separated list, trimming whitespace", () => {
    expect(parseShow(" bio , counts ", "GitlabUser")).toEqual(["bio", "counts"]);
  });

  it("allows an empty string (identity-only card)", () => {
    expect(parseShow("", "GitlabUser")).toEqual([]);
  });

  it("rejects unknown tokens", () => {
    expect(() => parseShow("bogus", "GitlabUser")).toThrow(/"show" token "bogus"/);
  });

  it("rejects non-string values", () => {
    expect(() => parseShow(5, "GitlabUsers")).toThrow(/"show" must be a comma-separated string/);
  });

  it("rejects the role token on GitlabUser but allows it on GitlabUsers", () => {
    expect(() => parseShow("role", "GitlabUser")).toThrow(/does not support "role"/);
    expect(parseShow("role", "GitlabUsers")).toEqual(["role"]);
  });
});

describe("needsProfile", () => {
  it("is false for identity/role-only tokens", () => {
    expect(needsProfile([])).toBe(false);
    expect(needsProfile(["role"])).toBe(false);
  });

  it("is true when any profile token is present", () => {
    expect(needsProfile(["role", "bio"])).toBe(true);
    expect(needsProfile(["counts"])).toBe(true);
    expect(needsProfile(["org"])).toBe(true);
    expect(needsProfile(["since"])).toBe(true);
    expect(needsProfile(["location"])).toBe(true);
  });
});

describe("roles", () => {
  it("maps GitLab access levels to role names", () => {
    expect(roleName(5)).toBe("minimal");
    expect(roleName(10)).toBe("guest");
    expect(roleName(15)).toBe("planner");
    expect(roleName(20)).toBe("reporter");
    expect(roleName(30)).toBe("developer");
    expect(roleName(40)).toBe("maintainer");
    expect(roleName(50)).toBe("owner");
  });

  it("falls back to the numeric value for unknown levels", () => {
    expect(roleName(99)).toBe("99");
  });

  it("parseRole validates case-insensitively; undefined means no filter", () => {
    expect(parseRole(undefined)).toBeUndefined();
    expect(parseRole("Developer")).toBe("developer");
    expect(() => parseRole("boss")).toThrow(/"role" must be one of/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/gitlab/users.test.ts`
Expected: FAIL — `Cannot find module './users'` (or similar resolution error).

- [ ] **Step 3: Write the implementation**

Create `src/gitlab/users.ts`:

```ts
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
```

- [ ] **Step 4: Add the `UserData` domain type**

In `src/gitlab/types.ts`, append after the `GroupProjectData` interface (after its closing `}` around line 125):

```ts
export interface UserData {
  id: number;
  username: string;
  name: string;
  webUrl: string;
  /** Localized via AssetManager; null when the user has no avatar. */
  avatarUrl: string | null;
  /** Role name (e.g. "developer"); set only for members lists. */
  role?: string;
  // Profile fields — null when not enriched or absent on the profile.
  jobTitle: string | null;
  organization: string | null;
  location: string | null;
  bio: string | null;
  followers: number | null;
  following: number | null;
  createdAt: string | null;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/gitlab/users.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 6: Commit**

```bash
git add src/gitlab/users.ts src/gitlab/users.test.ts src/gitlab/types.ts
git commit -m "feat: shared show/role helpers and UserData type for user components"
```

---

## Task 2: GitLabClient user/member methods

**Files:**

- Modify: `src/gitlab/client.ts` (add 4 methods)
- Modify: `src/gitlab/client.test.ts` (extend the gitbeaker mock + add tests)

- [ ] **Step 1: Write the failing tests**

In `src/gitlab/client.test.ts`:

a) Add four mock fns next to the existing ones (after `const projectMilestonesAllMock = vi.fn();`):

```ts
const usersAllMock = vi.fn();
const usersShowMock = vi.fn();
const groupMembersAllMock = vi.fn();
const projectMembersAllMock = vi.fn();
```

b) Extend the object returned by the mocked `Gitlab` constructor (inside the `vi.mock("@gitbeaker/rest", ...)` factory, after `ProjectMilestones: { all: projectMilestonesAllMock },`):

```ts
      Users: { all: usersAllMock, show: usersShowMock },
      GroupMembers: { all: groupMembersAllMock },
      ProjectMembers: { all: projectMembersAllMock },
```

c) Add a describe block at the end of the file:

```ts
describe("users and members", () => {
  it("getUserByUsername queries the users endpoint with an exact username", async () => {
    usersAllMock.mockResolvedValue([{ id: 101, username: "jdoe" }]);
    const c = new GitLabClient({ host: "https://gitlab.example.com" });
    await expect(c.getUserByUsername("jdoe")).resolves.toEqual([{ id: 101, username: "jdoe" }]);
    expect(usersAllMock).toHaveBeenCalledWith({ username: "jdoe", maxPages: 1 });
  });

  it("getUser fetches the full single-user profile", async () => {
    usersShowMock.mockResolvedValue({ id: 101, bio: "hi" });
    const c = new GitLabClient({ host: "https://gitlab.example.com" });
    await expect(c.getUser(101)).resolves.toEqual({ id: 101, bio: "hi" });
    expect(usersShowMock).toHaveBeenCalledWith(101);
  });

  it("member fetches include inherited members with the 500-item ceiling", async () => {
    groupMembersAllMock.mockResolvedValue([]);
    projectMembersAllMock.mockResolvedValue([]);
    const c = new GitLabClient({ host: "https://gitlab.example.com" });
    await c.getGroupMembers("my-group");
    expect(groupMembersAllMock).toHaveBeenCalledWith("my-group", {
      includeInherited: true,
      perPage: 100,
      maxPages: 5,
    });
    await c.getProjectMembers("group/repo");
    expect(projectMembersAllMock).toHaveBeenCalledWith("group/repo", {
      includeInherited: true,
      perPage: 100,
      maxPages: 5,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/gitlab/client.test.ts`
Expected: FAIL — `c.getUserByUsername is not a function`.

- [ ] **Step 3: Implement the client methods**

In `src/gitlab/client.ts`, add after `getProjectMilestones` (before the private `headers()` method):

```ts
  /** Exact-username lookup (GET /users?username=...); returns 0 or 1 matches. */
  async getUserByUsername(username: string): Promise<any[]> {
    return this.api.Users.all({ username, maxPages: 1 });
  }

  /** Single-user GET — the only endpoint that carries the full public profile. */
  async getUser(id: number): Promise<any> {
    return this.api.Users.show(id);
  }

  async getGroupMembers(group: ProjectRef, opts: PageOptions = {}): Promise<any[]> {
    return this.api.GroupMembers.all(group, {
      includeInherited: true,
      perPage: opts.perPage ?? DEFAULT_PER_PAGE,
      maxPages: opts.maxPages ?? DEFAULT_MAX_PAGES,
    });
  }

  async getProjectMembers(project: ProjectRef, opts: PageOptions = {}): Promise<any[]> {
    return this.api.ProjectMembers.all(project, {
      includeInherited: true,
      perPage: opts.perPage ?? DEFAULT_PER_PAGE,
      maxPages: opts.maxPages ?? DEFAULT_MAX_PAGES,
    });
  }
```

If TypeScript rejects an option object (gitbeaker's typings are strict about pagination generics), cast the options object `as any` — the codebase already does this for `Repositories.allContributors` and `Epics.all`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/gitlab/client.test.ts`
Expected: PASS (existing + 3 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/client.ts src/gitlab/client.test.ts
git commit -m "feat: client methods for users and group/project members"
```

---

## Task 3: `fetchUser` fetcher

**Files:**

- Modify: `src/gitlab/fetchers.ts`
- Modify: `src/gitlab/fetchers.test.ts`

The test file already has a `ctx(client)` helper (top of file) building a real temp-dir `FileCache` and a `vi.fn()` assets localizer that returns `/gitlab-assets/<slug>.png`.

- [ ] **Step 1: Write the failing tests**

In `src/gitlab/fetchers.test.ts`: add `fetchUser` to the existing import from `"./fetchers"`, then append:

```ts
describe("fetchUser", () => {
  const profile = {
    id: 101, username: "jdoe", name: "Jane Doe", web_url: "https://x/jdoe", avatar_url: "https://x/a.png",
    job_title: "Senior Developer", organization: "ACME", location: "Paris", bio: "Docs enthusiast",
    followers: 12, following: 34, created_at: "2020-01-15T00:00:00Z",
  };

  it("resolves the username and normalizes the full profile", async () => {
    const client = {
      getUserByUsername: vi.fn(async () => [{ id: 101, username: "jdoe" }]),
      getUser: vi.fn(async () => profile),
    };
    const c = ctx(client);
    const data = await fetchUser(c, { name: "jdoe" });
    expect(client.getUserByUsername).toHaveBeenCalledWith("jdoe");
    expect(client.getUser).toHaveBeenCalledWith(101);
    expect(data).toMatchObject({
      id: 101, username: "jdoe", name: "Jane Doe", webUrl: "https://x/jdoe",
      jobTitle: "Senior Developer", organization: "ACME", location: "Paris",
      bio: "Docs enthusiast", followers: 12, following: 34, createdAt: "2020-01-15T00:00:00Z",
    });
    expect(c.assets.localize).toHaveBeenCalledWith("https://x/a.png", "", "user/jdoe");
    expect(data.avatarUrl).toMatch(/^\/gitlab-assets\//);
  });

  it("throws a clear error when the username does not exist", async () => {
    const client = { getUserByUsername: vi.fn(async () => []), getUser: vi.fn() };
    await expect(fetchUser(ctx(client), { name: "nope" })).rejects.toThrow(/user "nope" not found/);
    expect(client.getUser).not.toHaveBeenCalled();
  });

  it("requires a name and rejects invalid show tokens", async () => {
    await expect(fetchUser(ctx({}), {})).rejects.toThrow(/requires a "name"/);
    await expect(fetchUser(ctx({}), { name: "jdoe", show: "role" })).rejects.toThrow(/does not support "role"/);
  });

  it("nulls absent profile fields and skips avatar localization when absent", async () => {
    const client = {
      getUserByUsername: vi.fn(async () => [{ id: 7, username: "bob" }]),
      getUser: vi.fn(async () => ({ id: 7, username: "bob", name: "Bob", web_url: "https://x/bob", avatar_url: null })),
    };
    const c = ctx(client);
    const data = await fetchUser(c, { name: "bob" });
    expect(data).toMatchObject({
      jobTitle: null, organization: null, location: null, bio: null,
      followers: null, following: null, createdAt: null,
    });
    expect(data.avatarUrl).toBeNull();
    expect(c.assets.localize).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/gitlab/fetchers.test.ts`
Expected: FAIL — `fetchUser` is not exported.

- [ ] **Step 3: Implement `fetchUser`**

In `src/gitlab/fetchers.ts`:

a) Add `UserData` to the type-only import from `"./types"`, and add below the existing imports:

```ts
import { needsProfile, parseRole, parseShow, roleName } from "./users.js";
```

b) Add after the `fetchLabels` function (after its closing `}`, around line 412):

```ts
/**
 * Normalize a snake_case user/member payload to `UserData`. Fields the payload
 * lacks (members payloads have no profile fields) become null.
 */
async function normalizeUser(ctx: GitLabContext, u: any, role?: string): Promise<UserData> {
  // Avatar URLs are absolute; the "user/<username>" scope only namespaces the local asset.
  const avatarUrl = u.avatar_url ? await ctx.assets.localize(u.avatar_url, "", `user/${u.username}`) : null;
  return {
    id: u.id,
    username: u.username,
    name: u.name ?? u.username,
    webUrl: u.web_url,
    avatarUrl,
    ...(role === undefined ? {} : { role }),
    jobTitle: u.job_title ?? null,
    organization: u.organization ?? null,
    location: u.location ?? null,
    bio: u.bio ?? null,
    followers: typeof u.followers === "number" ? u.followers : null,
    following: typeof u.following === "number" ? u.following : null,
    createdAt: u.created_at ?? null,
  };
}

/**
 * Resolve a username to its full profile. Memoized per username so members
 * shared across pages/components cost one lookup per build; `show` never
 * affects this data.
 */
async function fetchUserProfile(ctx: GitLabContext, username: string): Promise<UserData> {
  return memo(ctx, `user:${username}`, async () => {
    const matches = await ctx.client.getUserByUsername(username);
    const found = matches.find((u: any) => u.username === username);
    if (!found) {
      throw new Error(`@ebuildy/docusaurus-plugin-gitlab: GitLab user "${username}" not found.`);
    }
    return normalizeUser(ctx, await ctx.client.getUser(found.id));
  });
}

export async function fetchUser(ctx: GitLabContext, attrs: Attrs): Promise<UserData> {
  const name = typeof attrs.name === "string" ? attrs.name.trim() : "";
  if (!name) {
    throw new Error(`@ebuildy/docusaurus-plugin-gitlab: <GitlabUser> requires a "name" (GitLab username).`);
  }
  parseShow(attrs.show, "GitlabUser"); // validate only; `show` is presentational (read by the component)
  return fetchUserProfile(ctx, name);
}
```

(`needsProfile`, `parseRole`, and `roleName` are used by Task 4 — TypeScript's unused-import check passes because they're all in one import statement that `fetchUser` partially uses; if `noUnusedLocals` still complains, import only `parseShow` here and add the rest in Task 4.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/gitlab/fetchers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/fetchers.ts src/gitlab/fetchers.test.ts
git commit -m "feat: fetchUser — resolve a username to a normalized, cached profile"
```

---

## Task 4: `fetchUsers` fetcher (members + enrich-on-demand)

**Files:**

- Modify: `src/gitlab/fetchers.ts`
- Modify: `src/gitlab/fetchers.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/gitlab/fetchers.test.ts`: add `fetchUsers` to the import from `"./fetchers"`, then append:

```ts
describe("fetchUsers", () => {
  // Unsorted + one duplicate (a user can be direct AND inherited member).
  const members = [
    { id: 1, username: "jdoe", name: "Jane Doe", web_url: "https://x/jdoe", avatar_url: null, access_level: 50 },
    { id: 2, username: "bob", name: "Bob Martin", web_url: "https://x/bob", avatar_url: null, access_level: 30 },
    { id: 2, username: "bob", name: "Bob Martin", web_url: "https://x/bob", avatar_url: null, access_level: 30 },
  ];

  function membersClient() {
    return {
      getGroupMembers: vi.fn(async () => members),
      getProjectMembers: vi.fn(async () => members),
      getUserByUsername: vi.fn(async (u: string) => [{ id: u === "jdoe" ? 1 : 2, username: u }]),
      getUser: vi.fn(async (id: number) => ({
        id,
        username: id === 1 ? "jdoe" : "bob",
        name: id === 1 ? "Jane Doe" : "Bob Martin",
        web_url: "https://x/u",
        avatar_url: null,
        bio: "hi",
        followers: 1,
        following: 2,
      })),
    };
  }

  it("requires exactly one of project/group", async () => {
    await expect(fetchUsers(ctx({}), {})).rejects.toThrow(/exactly one of "project" or "group"/);
    await expect(fetchUsers(ctx({}), { project: "g/r", group: "g" })).rejects.toThrow(/exactly one/);
  });

  it("lists members with role names, deduped and sorted by display name", async () => {
    const client = membersClient();
    const data = await fetchUsers(ctx(client), { group: "my-group" });
    expect(client.getGroupMembers).toHaveBeenCalledWith("my-group");
    expect(data.map((u) => u.username)).toEqual(["bob", "jdoe"]);
    expect(data.map((u) => u.role)).toEqual(["developer", "owner"]);
    // default show="role" is identity-only → zero per-user profile calls
    expect(client.getUserByUsername).not.toHaveBeenCalled();
    expect(client.getUser).not.toHaveBeenCalled();
    expect(data[0]).toMatchObject({ bio: null, followers: null, createdAt: null });
  });

  it("filters by role (exact, case-insensitive) and applies limit", async () => {
    const devs = await fetchUsers(ctx(membersClient()), { group: "my-group", role: "Developer" });
    expect(devs.map((u) => u.username)).toEqual(["bob"]);
    const limited = await fetchUsers(ctx(membersClient()), { group: "my-group", limit: 1 });
    expect(limited.map((u) => u.username)).toEqual(["bob"]);
  });

  it("rejects an unknown role and a non-positive limit", async () => {
    await expect(fetchUsers(ctx({}), { group: "g", role: "boss" })).rejects.toThrow(/"role" must be one of/);
    await expect(fetchUsers(ctx({}), { group: "g", limit: 0 })).rejects.toThrow(/"limit" must be a positive number/);
  });

  it("enriches each member exactly once when show needs profile fields", async () => {
    const client = membersClient();
    const data = await fetchUsers(ctx(client), { project: "g/r", show: "role,bio,counts" });
    expect(client.getProjectMembers).toHaveBeenCalledWith("g/r");
    expect(client.getUser).toHaveBeenCalledTimes(2);
    expect(data.map((u) => u.bio)).toEqual(["hi", "hi"]);
    // role comes from the members payload, not the profile
    expect(data.map((u) => u.role)).toEqual(["developer", "owner"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/gitlab/fetchers.test.ts`
Expected: FAIL — `fetchUsers` is not exported.

- [ ] **Step 3: Implement `fetchUsers`**

In `src/gitlab/fetchers.ts`, add after `fetchUser`:

```ts
export async function fetchUsers(ctx: GitLabContext, attrs: Attrs): Promise<UserData[]> {
  const project = attrs.project as string | number | undefined;
  const group = attrs.group as string | number | undefined;
  if ((project === undefined) === (group === undefined)) {
    throw new Error(
      `@ebuildy/docusaurus-plugin-gitlab: <GitlabUsers> requires exactly one of "project" or "group".`,
    );
  }
  const show = parseShow(attrs.show, "GitlabUsers");
  const enrich = needsProfile(show);
  const role = parseRole(attrs.role);
  const limit = attrs.limit === undefined ? undefined : Number(attrs.limit);
  if (limit !== undefined && !(Number.isFinite(limit) && limit > 0)) {
    throw new Error(
      `@ebuildy/docusaurus-plugin-gitlab: <GitlabUsers> "limit" must be a positive number; ` +
        `got ${JSON.stringify(attrs.limit)}.`,
    );
  }
  const scopeKey = project !== undefined ? `p:${String(project)}` : `g:${String(group)}`;
  const key = `users:${scopeKey}:role=${role ?? "all"}:limit=${limit ?? "all"}:enrich=${enrich ? 1 : 0}`;
  return memo(ctx, key, async () => {
    const raw =
      project !== undefined
        ? await ctx.client.getProjectMembers(project)
        : await ctx.client.getGroupMembers(group as string | number);
    // /members/all can list a user under several ancestors — keep the first occurrence.
    const seen = new Set<number>();
    let members = raw.filter((m: any) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    if (role !== undefined) members = members.filter((m: any) => roleName(m.access_level) === role);
    members = sortByName(members, (m: any) => String(m.name ?? m.username), "asc");
    if (limit !== undefined) members = members.slice(0, limit);
    if (!enrich) {
      return Promise.all(members.map((m: any) => normalizeUser(ctx, m, roleName(m.access_level))));
    }
    // Sequential on purpose: keeps the request pattern gentle; each profile is
    // individually memoized so repeat builds and shared members are free.
    const users: UserData[] = [];
    for (const m of members) {
      const full = await fetchUserProfile(ctx, m.username);
      users.push({ ...full, role: roleName(m.access_level) });
    }
    return users;
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/gitlab/fetchers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/fetchers.ts src/gitlab/fetchers.test.ts
git commit -m "feat: fetchUsers — group/project members with role filter and enrich-on-demand"
```

---

## Task 5: Registry entries

**Files:**

- Modify: `src/remark/registry.ts`

- [ ] **Step 1: Register both components**

Replace the full content of `src/remark/registry.ts` with:

```ts
import {
  fetchProjectInfo,
  fetchReadme,
  fetchReleases,
  fetchIssues,
  fetchFile,
  fetchTopics,
  fetchLabels,
  fetchGroupProjects,
  fetchRoadmap,
  fetchUser,
  fetchUsers,
  type GitLabContext,
} from "../gitlab/fetchers.js";

export type Fetcher = (ctx: GitLabContext, attrs: Record<string, unknown>) => Promise<unknown>;

export const COMPONENT_REGISTRY: Record<string, Fetcher> = {
  GitlabProjectInfo: fetchProjectInfo,
  GitlabReadme: fetchReadme,
  GitlabReleases: fetchReleases,
  GitlabIssues: fetchIssues,
  GitlabFile: fetchFile,
  GitlabTopics: fetchTopics,
  GitlabLabels: fetchLabels,
  GitlabProjectGrid: fetchGroupProjects,
  GitlabRoadmap: fetchRoadmap,
  GitlabUser: fetchUser,
  GitlabUsers: fetchUsers,
};
```

- [ ] **Step 2: Run the remark tests (registry has no dedicated test; this catches import errors)**

Run: `pnpm exec vitest run src/remark`
Expected: PASS (unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/remark/registry.ts
git commit -m "feat: register GitlabUser and GitlabUsers in the remark component registry"
```

---

## Task 6: `UserCard` partial + `GitlabUser` component

**Files:**

- Modify: `src/components/types.ts` (re-export `UserData`)
- Create: `src/components/UserCard.tsx`
- Create: `src/components/GitlabUser.tsx`
- Create: `src/components/GitlabUser.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/GitlabUser.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GitlabUser } from "./GitlabUser";

const user = {
  id: 101,
  username: "jdoe",
  name: "Jane Doe",
  webUrl: "https://x/jdoe",
  avatarUrl: "/gitlab-assets/jdoe.png",
  jobTitle: "Senior Developer",
  organization: "ACME",
  location: "Paris",
  bio: "Docs enthusiast",
  followers: 12,
  following: 34,
  createdAt: "2020-01-15T00:00:00Z",
};

describe("GitlabUser", () => {
  it("renders identity and the default profile sections", () => {
    render(<GitlabUser data={user as any} />);
    expect(screen.getByRole("img", { name: "Jane Doe" })).toHaveAttribute("src", "/gitlab-assets/jdoe.png");
    expect(screen.getByRole("link", { name: "@jdoe" })).toHaveAttribute("href", "https://x/jdoe");
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Senior Developer · ACME")).toBeInTheDocument();
    expect(screen.getByText("Paris")).toBeInTheDocument();
    expect(screen.getByText("Docs enthusiast")).toBeInTheDocument();
    expect(screen.getByText("12 followers · 34 following")).toBeInTheDocument();
    expect(screen.getByText(/Member since /)).toBeInTheDocument();
  });

  it("show narrows the sections", () => {
    render(<GitlabUser data={user as any} show="bio" />);
    expect(screen.getByText("Docs enthusiast")).toBeInTheDocument();
    expect(screen.queryByText("Paris")).not.toBeInTheDocument();
    expect(screen.queryByText(/followers/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Member since/)).not.toBeInTheDocument();
  });

  it("skips sections whose profile field is empty and the avatar when null", () => {
    render(<GitlabUser data={{ ...user, avatarUrl: null, bio: null, followers: null, following: null } as any} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("Docs enthusiast")).not.toBeInTheDocument();
    expect(screen.queryByText(/followers/)).not.toBeInTheDocument();
    expect(screen.getByText("Paris")).toBeInTheDocument();
  });

  it("renders partial follower counts when only one side is known", () => {
    render(<GitlabUser data={{ ...user, following: null } as any} show="counts" />);
    expect(screen.getByText("12 followers")).toBeInTheDocument();
  });

  it("renders nothing without data", () => {
    const { container } = render(<GitlabUser />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the Fallback on error", () => {
    render(<GitlabUser error={{ message: 'user "nope" not found', project: "nope" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("not found");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/components/GitlabUser.test.tsx`
Expected: FAIL — cannot resolve `./GitlabUser`.

- [ ] **Step 3: Re-export the type**

In `src/components/types.ts`, add `UserData,` to the export list (after `GroupProjectData,`):

```ts
export type {
  ProjectInfoData,
  ReleaseData,
  CommitData,
  IssueData,
  ReadmeData,
  FileData,
  TopicData,
  LabelData,
  GroupProjectData,
  UserData,
  FetchError,
  ComponentPayload,
  LabelRef,
  RoadmapSource,
  RoadmapState,
  RoadmapScale,
  RoadmapItemData,
  RoadmapPositionedItem,
  ScaleTick,
  RoadmapGroup,
  RoadmapData,
} from "../gitlab/types.js";
```

- [ ] **Step 4: Implement `UserCard`**

Create `src/components/UserCard.tsx` (internal partial — not exported from `index.ts`):

```tsx
import React from "react";
import { formatDate } from "./formatDate.js";
import type { UserShowToken } from "../gitlab/users.js";
import type { UserData } from "./types.js";

/** One user card. `show` is the parsed token list; identity always renders. */
export function UserCard({ user, show }: { user: UserData; show: readonly UserShowToken[] }) {
  const has = (t: UserShowToken) => show.includes(t);
  const orgLine = [user.jobTitle, user.organization].filter(Boolean).join(" · ");
  const counts = [
    user.followers !== null ? `${user.followers} followers` : null,
    user.following !== null ? `${user.following} following` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="gitlab-card gitlab-user-card">
      <div className="gitlab-user-card-header">
        {user.avatarUrl && (
          <img className="gitlab-avatar" src={user.avatarUrl} alt={user.name} width={48} height={48} />
        )}
        <div className="gitlab-user-identity">
          <strong className="gitlab-user-name">{user.name}</strong>
          <a className="gitlab-user-username" href={user.webUrl}>
            @{user.username}
          </a>
          {has("role") && user.role && <span className="gitlab-badge gitlab-user-role">{user.role}</span>}
        </div>
      </div>
      {has("org") && orgLine && <p className="gitlab-user-org">{orgLine}</p>}
      {has("location") && user.location && <p className="gitlab-user-location">{user.location}</p>}
      {has("bio") && user.bio && <p className="gitlab-user-bio">{user.bio}</p>}
      {has("counts") && counts && <p className="gitlab-user-counts">{counts}</p>}
      {has("since") && user.createdAt && (
        <p className="gitlab-user-since">Member since {formatDate(user.createdAt)}</p>
      )}
    </div>
  );
}
```

Note: `user.bio` is plain text from the API and renders as text — **never** via `dangerouslySetInnerHTML`.

- [ ] **Step 5: Implement `GitlabUser`**

Create `src/components/GitlabUser.tsx`:

```tsx
import React from "react";
import { Fallback } from "./Fallback.js";
import { UserCard } from "./UserCard.js";
import { parseShow } from "../gitlab/users.js";
import type { ComponentPayload, UserData } from "./types.js";

interface GitlabUserProps extends ComponentPayload<UserData> {
  /** Comma-separated card sections; validated at build time by the fetcher. */
  show?: string;
}

export function GitlabUser({ data, error, show }: GitlabUserProps) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return <UserCard user={data} show={parseShow(show, "GitlabUser")} />;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/components/GitlabUser.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/types.ts src/components/UserCard.tsx src/components/GitlabUser.tsx src/components/GitlabUser.test.tsx
git commit -m "feat: GitlabUser component with shared UserCard partial"
```

---

## Task 7: `GitlabUsers` component (cards grid, ComponentLayout)

**Files:**

- Create: `src/components/GitlabUsers.tsx`
- Create: `src/components/GitlabUsers.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/GitlabUsers.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GitlabUsers } from "./GitlabUsers";

const users = [
  {
    id: 101, username: "jdoe", name: "Jane Doe", webUrl: "https://x/jdoe", avatarUrl: null, role: "owner",
    jobTitle: null, organization: null, location: null, bio: null, followers: null, following: null, createdAt: null,
  },
  {
    id: 102, username: "bob", name: "Bob Martin", webUrl: "https://x/bob", avatarUrl: null, role: "developer",
    jobTitle: "Dev", organization: "ACME", location: null, bio: null, followers: 2, following: 3, createdAt: null,
  },
];

describe("GitlabUsers", () => {
  it("renders one card per member with a role badge by default", () => {
    render(<GitlabUsers data={users as any} />);
    expect(screen.getByRole("link", { name: "@jdoe" })).toHaveAttribute("href", "https://x/jdoe");
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Bob Martin")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
    expect(screen.getByText("developer")).toBeInTheDocument();
    // default list card is identity + role only
    expect(screen.queryByText("Dev · ACME")).not.toBeInTheDocument();
  });

  it("adds profile sections to every card via show", () => {
    render(<GitlabUsers data={users as any} show="role,org,counts" />);
    expect(screen.getByText("Dev · ACME")).toBeInTheDocument();
    expect(screen.getByText("2 followers · 3 following")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
  });

  it("uses a responsive auto-fill grid with a 260px default min width", () => {
    const { container } = render(<GitlabUsers data={users as any} />);
    expect(container.querySelector(".gitlab-user-cards")).toHaveStyle({
      gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    });
  });

  it("lets cardColumns and gap tune the grid (ComponentLayout)", () => {
    const { container } = render(<GitlabUsers data={users as any} cardColumns={3} gap="1.5rem" />);
    expect(container.querySelector(".gitlab-user-cards")).toHaveStyle({
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: "1.5rem",
    });
  });

  it("renders an empty grid for an empty member list", () => {
    const { container } = render(<GitlabUsers data={[] as any} />);
    expect(container.querySelector(".gitlab-user-cards")).toBeEmptyDOMElement();
  });

  it("renders the Fallback on error", () => {
    render(<GitlabUsers error={{ message: "boom", project: "my-group" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/components/GitlabUsers.test.tsx`
Expected: FAIL — cannot resolve `./GitlabUsers`.

- [ ] **Step 3: Implement `GitlabUsers`**

Create `src/components/GitlabUsers.tsx`:

```tsx
import React from "react";
import { Fallback } from "./Fallback.js";
import { UserCard } from "./UserCard.js";
import { cardsGridStyle, type ComponentLayout } from "./layout.js";
import { parseShow } from "../gitlab/users.js";
import type { ComponentPayload, UserData } from "./types.js";

interface GitlabUsersProps extends ComponentPayload<UserData[]>, ComponentLayout {
  /** Comma-separated card sections; validated at build time by the fetcher. */
  show?: string;
}

export function GitlabUsers({
  data,
  error,
  show,
  cardColumns,
  cardMinWidth,
  gap,
  maxWidth,
  align,
}: GitlabUsersProps) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  const tokens = parseShow(show, "GitlabUsers");
  return (
    <div
      className="gitlab-user-cards"
      style={cardsGridStyle({ cardColumns, cardMinWidth: cardMinWidth ?? "260px", gap, maxWidth, align })}
    >
      {data.map((u) => (
        <UserCard key={u.username} user={u} show={tokens} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/components/GitlabUsers.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/GitlabUsers.tsx src/components/GitlabUsers.test.tsx
git commit -m "feat: GitlabUsers component — members cards grid with ComponentLayout props"
```

---

## Task 8: Public exports + typecheck

**Files:**

- Modify: `src/components/index.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Export the components**

In `src/components/index.ts`, add after `export { GitlabRoadmap } from "./GitlabRoadmap.js";`:

```ts
export { GitlabUser } from "./GitlabUser.js";
export { GitlabUsers } from "./GitlabUsers.js";
```

and add `UserData,` to the type re-export list in the same file (after `GroupProjectData,`).

- [ ] **Step 2: Export the domain type from the package root**

In `src/index.ts`, add `UserData,` to the `export type { ... } from "./gitlab/types.js";` list (after `GroupProjectData,`).

- [ ] **Step 3: Verify**

Run: `pnpm run typecheck`
Expected: exit 0, no errors.

Run: `pnpm exec vitest run src test/packaging.test.ts`
Expected: PASS — all unit tests green, including the packaging guard.

- [ ] **Step 4: Commit**

```bash
git add src/components/index.ts src/index.ts
git commit -m "feat: export GitlabUser, GitlabUsers and UserData"
```

---

## Task 9: e2e fixtures, example pages, README

**Files:**

- Modify: `test/e2e/fixtures.ts` (stub routes)
- Modify: `test/e2e/build.test.ts` (new assertion)
- Modify: `examples/site/docs/intro.mdx` (live usage — this is what the e2e asserts)
- Create: `examples/site/docs/components/user.mdx`
- Create: `examples/site/docs/components/users.mdx`
- Modify: `README.md` (component docs)

- [ ] **Step 1: Add stub users + members routes**

In `test/e2e/fixtures.ts`:

a) Add above `startGitlabStub` (module scope, after `ONE_PX_PNG`):

```ts
/** Stub users: jdoe is a group owner with a full profile, bob a developer with a sparse one. */
const STUB_USERS: Record<string, any> = {
  jdoe: {
    id: 101, username: "jdoe", name: "Jane Doe", avatar_url: null, web_url: "https://x/jdoe",
    job_title: "Senior Developer", organization: "ACME", location: "Paris", bio: "Docs enthusiast",
    followers: 12, following: 34, created_at: "2020-01-15T00:00:00Z",
  },
  bob: {
    id: 102, username: "bob", name: "Bob Martin", avatar_url: null, web_url: "https://x/bob",
    followers: 2, following: 3, created_at: "2021-06-01T00:00:00Z",
  },
};

const STUB_MEMBERS = [
  { id: 101, username: "jdoe", name: "Jane Doe", avatar_url: null, web_url: "https://x/jdoe", access_level: 50 },
  { id: 102, username: "bob", name: "Bob Martin", avatar_url: null, web_url: "https://x/bob", access_level: 30 },
];
```

b) Add these routes inside the request handler, immediately **after** the `/api/v4/topics` block and **before** the `/api/v4/groups/my-group/projects` block (the members route must precede the bare `/api/v4/groups/my-group` catch-all):

```ts
    if (url.startsWith("/api/v4/groups/my-group/members/all")) {
      return send(STUB_MEMBERS);
    }
    if (url.startsWith("/api/v4/projects/group%2Frepo/members/all")) {
      return send(STUB_MEMBERS);
    }
    if (url.startsWith("/api/v4/users/")) {
      const id = Number(url.slice("/api/v4/users/".length).split("?")[0]);
      const user = Object.values(STUB_USERS).find((u) => u.id === id);
      if (user) return send(user);
      res.writeHead(404);
      return res.end("not found");
    }
    if (url.startsWith("/api/v4/users")) {
      const username = new URL(url, "http://stub").searchParams.get("username") ?? "";
      return send(STUB_USERS[username] ? [STUB_USERS[username]] : []);
    }
```

(Note: the project members route must also precede the bare `/api/v4/projects/group%2Frepo` catch-all — it does, since that catch-all is last.)

- [ ] **Step 2: Add live usage to the example index page**

Append to `examples/site/docs/intro.mdx`:

```mdx

## Team

<GitlabUser name="jdoe" />

<GitlabUsers group="my-group" show="role,org,counts" cardColumns={2} gap="1rem" />
```

- [ ] **Step 3: Add the e2e assertion**

In `test/e2e/build.test.ts`, add after the `"bakes topics and labels into the static html"` test:

```ts
  it("bakes user cards into the static html", () => {
    const html = readFileSync(join(siteDir, "build", "index.html"), "utf8");
    // single card: identity + default profile sections
    expect(html).toContain("Jane Doe");
    expect(html).toContain("@jdoe");
    expect(html).toContain("12 followers");
    expect(html).toContain("Member since");
    // members grid: both members, role badges, enriched org line
    expect(html).toContain("gitlab-user-cards");
    expect(html).toContain("Bob Martin");
    expect(html).toContain("owner");
    expect(html).toContain("Senior Developer · ACME");
  });
```

- [ ] **Step 4: Run the e2e test (slow, ~1 min)**

Run: `pnpm exec vitest run test/e2e/build.test.ts`
Expected: PASS, including the new user-cards assertion.

- [ ] **Step 5: Write the component doc pages**

Create `examples/site/docs/components/user.mdx`:

````mdx
---
title: GitlabUser
sidebar_position: 11
---

# `<GitlabUser>`

Renders a GitLab user profile as a small card: photo, display name, linked
`@username`, and a configurable set of profile sections. All data comes from the
public user API at build time — nothing is fetched in the browser.

## Usage

```mdx
<GitlabUser name="jdoe" />

<GitlabUser name="jdoe" show="org,bio,counts" />
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | **required** | GitLab username (login). |
| `show` | `string` | `org,location,bio,counts,since` | Comma-separated card sections (see below). |

## `show` tokens

The avatar, display name, and linked `@username` always render. Tokens add sections:

| Token | Section |
|---|---|
| `org` | Job title · organization |
| `location` | Location line |
| `bio` | Bio paragraph (plain text) |
| `counts` | Followers · following |
| `since` | "Member since <date>" |

An empty `show=""` renders an identity-only card. Sections whose profile field is
empty are skipped automatically.

## Notes

- The username must exist; an unknown user fails the build in strict mode (renders
  the fallback otherwise).
- The avatar is downloaded at build time and served from your site's static assets.
````

Create `examples/site/docs/components/users.mdx`:

````mdx
---
title: GitlabUsers
sidebar_position: 12
---

# `<GitlabUsers>`

Renders the members of a **group** or a **project** (including inherited members)
as a grid of user cards, optionally filtered by role.

## Usage

```mdx
<GitlabUsers group="my-group" />

<GitlabUsers project="group/repo" role="developer" />

<GitlabUsers group="my-group" show="role,org,counts" cardColumns={3} gap="1rem" maxWidth="900px" align="center" />
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `group` | `string \| number` | — | Group path or numeric ID. Provide **either** this or `project`. |
| `project` | `string \| number` | — | Project path or numeric ID. Provide **either** this or `group`. |
| `role` | `string` | — | Exact-match filter (case-insensitive): `minimal`, `guest`, `planner`, `reporter`, `developer`, `maintainer`, `owner`. |
| `show` | `string` | `role` | Same tokens as `<GitlabUser>`, plus `role` (a role badge on each card). |
| `limit` | `number` | all | Maximum members to show (applied after the role filter; the fetch itself is capped at 500). |

## Grid layout

The grid shares the standard card-grid props:

| Prop | Type | Default | Description |
|---|---|---|---|
| `cardColumns` | `number` | — | Fixed number of columns. Takes precedence over `cardMinWidth`. |
| `cardMinWidth` | `string` | `260px` | Minimum card width for a responsive (auto-fill) grid. |
| `gap` | `string` | — | Spacing between cards, e.g. `"1.5rem"`. |
| `maxWidth` | `string` | — | Constrain the grid width, e.g. `"900px"`. |
| `align` | `string` | `start` | `start` or `center` — placement of a width-constrained grid. |

## Build cost

The default `show="role"` needs a **single** members API call. Any profile token
(`org`, `location`, `bio`, `counts`, `since`) triggers one extra user lookup per
member at build time (cached on disk, deduplicated across pages and components).

## Notes

- Exactly one of `group` / `project` is required; both or neither fails the build.
- Members are fetched **including inherited** ones, like GitLab's members page.
- Cards are sorted by display name; an unknown `role` value fails the build.
````

- [ ] **Step 6: Add the README sections**

In `README.md`, insert between the end of the `### <GitlabLabels>` section (after the "Both components render scoped labels…" paragraph, ~line 262) and `### <GitlabRoadmap>`:

````markdown
### `<GitlabUser>`

A user profile as a small card: photo, display name, linked `@username`, and
configurable profile sections from the public user API.

```mdx
<GitlabUser name="jdoe" />

<GitlabUser name="jdoe" show="org,bio,counts" />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `name` | string | required | GitLab username |
| `show` | string | `org,location,bio,counts,since` | Card sections: `org`, `location`, `bio`, `counts` (followers/following), `since` (member since) |

### `<GitlabUsers>`

The members of a group **or** project (inherited included) as a grid of user cards.

```mdx
<GitlabUsers group="my-group" role="developer" />

<GitlabUsers project="group/repo" show="role,org,counts" cardColumns={3} gap="1rem" />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `group` | string \| number | — | Provide either `group` or `project` |
| `project` | string \| number | — | Provide either `group` or `project` |
| `role` | string | — | Exact-match filter: `guest`, `reporter`, `developer`, `maintainer`, `owner`, … |
| `show` | string | `role` | `<GitlabUser>` tokens plus `role` (role badge) |
| `limit` | number | all | Max members to show (fetch capped at 500) |

The grid accepts the shared card-grid props: `cardColumns`, `cardMinWidth`
(default `260px`), `gap`, `maxWidth`, `align`. The default `show="role"` costs a
single members call; profile tokens add one cached user lookup per member at
build time.
````

- [ ] **Step 7: Commit**

```bash
git add test/e2e/fixtures.ts test/e2e/build.test.ts examples/site/docs/intro.mdx examples/site/docs/components/user.mdx examples/site/docs/components/users.mdx README.md
git commit -m "docs: GitlabUser/GitlabUsers pages, README sections, and e2e coverage"
```

---

## Task 10: Final verification

- [ ] **Step 1: Full unit suite**

Run: `pnpm test`
Expected: PASS, zero failures.

- [ ] **Step 2: Typecheck + package build**

Run: `pnpm run typecheck && pnpm run build`
Expected: both exit 0; `dist/` contains `components/GitlabUser.js`, `components/GitlabUsers.js`, `gitlab/users.js`.

- [ ] **Step 3: e2e (if not already run in Task 9)**

Run: `pnpm exec vitest run test/e2e/build.test.ts`
Expected: PASS.

- [ ] **Step 4: Update the knowledge graph**

Run: `graphify update .`
Expected: completes without error (AST-only).

- [ ] **Step 5: Verify all commits are signed**

Run: `git log --format="%h %G? %s" -10`
Expected: every new commit shows `G`.
