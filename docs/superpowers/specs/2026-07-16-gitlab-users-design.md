# Design: `GitlabUser` & `GitlabUsers` components

**Date:** 2026-07-16
**Status:** Approved (brainstorming)

## Summary

Two new build-time MDX components that render GitLab **user profiles** as small
cards. Both follow the existing pipeline: `registry → fetcher → inject → pure
component`, with all data fetched at build time and baked into static HTML.

- `<GitlabUser>` — one user card looked up by **username**: photo, display name,
  linked @username, and a configurable set of profile sections (job title /
  organization, location, bio, follower counts, member-since).
- `<GitlabUsers>` — a cards grid of the members of a **group** or a **project**,
  optionally filtered by **role** (exact match), reusing the shared
  `ComponentLayout` grid knobs (`cardColumns`, `cardMinWidth`, `gap`, `maxWidth`,
  `align`) and `cardsGridStyle()` from `src/components/layout.ts`.

Card content is driven by a `show` attribute on both components. For
`GitlabUsers`, `show` also drives fetching cost (**enrich on demand**): the
members API alone covers identity + role; any profile section beyond that
triggers one extra (memoized) user lookup per member at build time.

Only fields returned by the GitLab **user API** are used. Activity/contribution
metrics (events, contributed projects) come from other endpoints and are out of
scope.

## Attribute surface

### `<GitlabUser>`

| attr | type | default | notes |
|---|---|---|---|
| `name` | string | **required** | GitLab username (login), e.g. `"jdoe"` |
| `show` | string | `org,location,bio,counts,since` | comma-separated section tokens, see below |

### `<GitlabUsers>`

Exactly one of `project` / `group`, plus the shared layout knobs.

| attr | type | default | notes |
|---|---|---|---|
| `project` | string \| number | — | e.g. `"group/proj"` or numeric id |
| `group` | string \| number | — | e.g. `"my-group"` or numeric id |
| `role` | string | — | exact-match filter, case-insensitive: `minimal` \| `guest` \| `planner` \| `reporter` \| `developer` \| `maintainer` \| `owner` |
| `show` | string | `role` | same tokens as `GitlabUser`, plus `role` |
| `limit` | number | all | cap applied after role filter + sort |
| `cardColumns` | number | — | `ComponentLayout` (presentational, never reaches the fetcher) |
| `cardMinWidth` | string | `"260px"` | `ComponentLayout` |
| `gap` | string | — | `ComponentLayout` |
| `maxWidth` | string | — | `ComponentLayout` |
| `align` | string | — | `ComponentLayout`: `start` \| `center` |

### `show` tokens

Identity (avatar, display name, @username linked to the GitLab profile) is
**always** rendered and needs no token.

| token | card section | needs enrichment (`GitlabUsers`) |
|---|---|---|
| `org` | job title · organization | yes |
| `location` | location line | yes |
| `bio` | bio paragraph (plain text) | yes |
| `counts` | followers · following | yes |
| `since` | "Member since <month year>" | yes |
| `role` | role badge (`GitlabUsers` only) | no — comes from the members API |

**Validation (build-time errors, standard remark error path):**

- `<GitlabUser>` without `name` throws.
- `<GitlabUsers>` with both or neither of `project` / `group` throws.
- Unknown `show` token throws; `role` token on `<GitlabUser>` throws.
- Invalid `role` value throws.
- `limit` must be a positive number.

All attribute values remain **static literals** (enforced by `parseAttributes`).

## Domain types (`src/gitlab/types.ts`)

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

`fetchUsers` returns `UserData[]` (same convention as `TopicData[]` /
`LabelData[]`).

## Data flow

### Single user (`fetchUser`)

1. `client.getUserByUsername(name)` → `api.Users.all({ username })` — exact
   username lookup; empty result → clear "user not found" error.
2. `client.getUser(id)` → `api.Users.show(id)` — the single-user GET is what
   carries the full public profile (`bio`, `job_title`, `organization`,
   `location`, `followers`, `following`, `created_at`).
   **Verification during implementation:** confirm the exact field names against
   the live user API (notably `followers` / `following` and `work_information`
   vs `job_title`/`organization`); adjust normalization if they differ.
3. Avatar localized via `ctx.assets.localize(avatar_url, ...)`, same as project
   avatars in `fetchProjectInfo`.
4. Normalized `UserData` memoized under `user:${username}` — the **full** profile
   is always fetched and cached; `show` is presentational and excluded from the
   cache key.

### Members list (`fetchUsers`)

1. `client.getGroupMembers(group)` / `client.getProjectMembers(project)` →
   `api.GroupMembers.all` / `api.ProjectMembers.all` with
   `{ includeInherited: true }` (the `/members/all` endpoint — matches what the
   GitLab members page shows), paginated with the same safety ceiling as
   topics/labels: `perPage: 100`, max 5 pages → **500 members max** (do not
   raise; see the existing cap rationale).
2. `access_level` mapped to a role name via one shared map
   (`5:minimal, 10:guest, 15:planner, 20:reporter, 30:developer, 40:maintainer,
   50:owner`); unknown levels render as the numeric value and never match a
   `role` filter.
3. **Filter** by `role` (exact, case-insensitive) → **sort** by display name
   (`localeCompare`, ascending — deterministic builds; no `order` attribute for
   now) → **limit**.
4. **Enrich on demand:** if the resolved `show` set contains any token marked
   "needs enrichment" above, each remaining member is resolved through the same
   per-user path as `fetchUser` (individually memoized under `user:${username}`,
   so members shared across pages/components cost one lookup per build). If not,
   the members payload alone (id, username, name, avatar_url, web_url,
   access_level) fills `UserData` with profile fields `null`.
5. Result memoized under a key containing scope, role, limit, and an
   `enrich:0|1` flag — `show` beyond that flag does not change the data.

### How `show` and layout props reach the components

As with `layout` on `GitlabLabels`: `injectProp` only pushes the `data`/`error`
attribute, so `show`, `cardColumns`, `gap`, etc. survive remark and arrive as
ordinary React props. The fetcher validates `show`/`role`; the components read
them directly.

### Shared `show`/role helpers

A small pure module `src/gitlab/users.ts` (no Node/gitbeaker imports, safe for
the browser bundle) holds the `show` token list, per-component defaults, the
parse/validate helper, and the access-level→role map. Both the fetchers and the
components import it, so defaults and enrichment triggers cannot drift apart.

## Client additions (`src/gitlab/client.ts`)

```ts
async getUserByUsername(username: string): Promise<any[]> {
  return this.api.Users.all({ username });
}
async getUser(id: number): Promise<any> {
  return this.api.Users.show(id);
}
async getGroupMembers(group: ProjectRef, pagination): Promise<any[]> {
  return this.api.GroupMembers.all(group, { includeInherited: true, ...pagination });
}
async getProjectMembers(project: ProjectRef, pagination): Promise<any[]> {
  return this.api.ProjectMembers.all(project, { includeInherited: true, ...pagination });
}
```

**Verification during implementation:** confirm the gitbeaker resource names
(`Users`, `GroupMembers`, `ProjectMembers`) and the `includeInherited` option in
the installed gitbeaker version; fall back to the explicit `/members/all`
endpoint call if the option differs.

## Registry (`src/remark/registry.ts`)

```ts
GitlabUser: fetchUser,
GitlabUsers: fetchUsers,
```

## Components (`src/components/`)

Pure, `error → Fallback; !data → null; else render`. Plain global class names
(no CSS module import), following the existing convention: `gitlab-user-card`,
`gitlab-user-cards`, `gitlab-avatar`, `gitlab-user-role`, etc.

- **`UserCard.tsx`** — internal shared partial rendering one card from a
  `UserData` + a resolved `show` set. Header: avatar (`<img>` with the localized
  URL, `alt` = display name), display name, `@username` linked to `webUrl`.
  Sections render only when their token is in `show` **and** the field is
  non-null. Bio is plain text from the API — rendered as text, **no**
  `dangerouslySetInnerHTML`.
- **`GitlabUser.tsx`** — `ComponentPayload<UserData> & { show?: string }`;
  renders one `UserCard`.
- **`GitlabUsers.tsx`** — `ComponentPayload<UserData[]> & ComponentLayout &
  { show?: string }`; renders a grid container styled with
  `cardsGridStyle({ cardColumns, cardMinWidth: cardMinWidth ?? "260px", gap,
  maxWidth, align })`, one `UserCard` per member (plus the role badge when
  `show` includes `role`). An empty array renders the empty container
  (consistent with `GitlabIssues` / `GitlabTopics`).

No `Map`/`Set` iterator spreads in these files (Babel `iterableIsArray`
gotcha) — use `Array.from` if a `Set` of show tokens is materialized.

## Exports

- `src/components/index.ts` — export `GitlabUser`, `GitlabUsers`.
- `src/index.ts` — export `UserData` type.

## Error handling

Unchanged: fetchers throw; the remark transformer centralizes `strict`
handling (throw → abort build in production, or inject an `error` prop →
`Fallback` in dev). "User not found", "group/project not found", and all
attribute-validation failures surface through this path.

## Testing (TDD)

**Fetcher tests** (fake/mocked client):

- `fetchUser`: username resolution (found / not found); normalization of
  snake_case profile fields; avatar localization; memo key excludes `show`.
- `fetchUsers`: group vs project source; both/neither scope → error; role
  filter (exact, case-insensitive, unknown value → error); access-level→role
  mapping; sort + limit; 500-member ceiling; **enrich-on-demand: identity-only
  `show` performs zero per-user calls, a profile token triggers exactly one
  lookup per member**; invalid `show` token → error.

**Component tests** (React Testing Library):

- `UserCard` via `GitlabUser`: avatar `alt`, profile link `href`, each `show`
  token toggles its section, null fields render nothing, `error → Fallback`.
- `GitlabUsers`: renders one card per user; role badge with `show="role"`;
  layout props produce the expected `cardsGridStyle` inline styles (same
  assertions as the `GitlabLabels` cards tests); empty array → empty container;
  `error → Fallback`.

## Docs

- README section for both components (including the `show` table and the
  enrichment cost note).
- `examples/site/docs/components/` page for each (exercised by the slow e2e
  build in `test/e2e/build.test.ts`).

## Out of scope

- Activity/contribution metrics (events API, contributed-projects) — not part
  of the user API.
- `publicEmail` / website / social links on the card.
- An `order` attribute (fixed name-ascending sort).
- Filtering by minimum access level (`role` is exact-match only).
- Direct-members-only mode (inherited members are always included).
