# Role-Based Access Control (RBAC) — Per Tenant

Habit Intelligence is a multi-tenant SaaS where each tenant (Client / CUG)
sees only their own warehouse data. RBAC is enforced at three layers: the
data layer (CUG-scoped queries), the API layer (role + assignment checks),
and the UI layer (role-aware navigation, hidden actions).

This document is the authoritative reference for who can see and do what.

---

## Roles

Defined as the `Role` enum in `prisma/schema.prisma`.

| Role | Cohort | Reach | Tenant scope |
|---|---|---|---|
| `SUPER_ADMIN` | Internal | All clients, all features, all admin pages | Any CUG (switch via client picker) |
| `INTERNAL_OPS` | Internal | All clients, read-only on configuration | Any CUG (switch via client picker) |
| `KAM` | Internal | Only clients explicitly assigned via `user_client_assignments` | Their assigned CUGs only |
| `CLIENT_ADMIN` | External | Their own tenant only; can edit annotations, KAM-style comments, page config visible to them | One CUG (`users.client_id`) |
| `CLIENT_VIEWER` | External | Their own tenant only; read-only — comments and most edits hidden | One CUG (`users.client_id`) |

> **Internal vs External** is the most important split.
> Internal users (SUPER_ADMIN, INTERNAL_OPS, KAM) are HCL Healthcare staff
> with multi-tenant reach. External users (CLIENT_ADMIN, CLIENT_VIEWER) are
> employees of the corporate client and are hard-pinned to one tenant.

---

## How "tenant" is enforced

A *tenant* is a row in `clients` (the Prisma `Client` model). Each row
carries:

- `cug_id` — primary tenant identifier in the warehouse fact tables
- `cug_code` — secondary identifier on `agg_*` aggregated tables
- `cug_name` — display name

Every warehouse query in the app routes through one of these helpers in
`lib/auth/session.ts`:

- `getSessionCugCode(requestedClientId?)` → string CUG code or null
- `getSessionCugId(requestedClientId?)` → string CUG ID or null

These are the **only** way the app obtains a CUG. The lookup logic per role:

| Role | Behavior of `getSessionCugCode(clientId?)` |
|---|---|
| `SUPER_ADMIN` / `INTERNAL_OPS` | If `clientId` supplied → returns that client's CUG. Otherwise null (caller should require a selection). |
| `KAM` | If `clientId` supplied AND the user has a row in `user_client_assignments` for that client → returns CUG. Otherwise null. |
| `CLIENT_ADMIN` / `CLIENT_VIEWER` | `clientId` parameter is **ignored**. Always returns the CUG of `users.client_id`. Cannot be widened from the client. |

Every API route under `/api/**` calls `requireAuth()` first, then
`getSessionCugCode()` to scope the SQL `WHERE cug_code_mapped = $1`.
If `getSessionCugCode` returns null, the route returns
`400 { error: "No client selected" }`.

This is the single chokepoint that prevents a CISCO viewer from ever
seeing HCL Technologies data — even with a forged `clientId` query param.

---

## What each role can do (UI surface)

### SUPER_ADMIN
- View any client's dashboards (Home / OHC / Employee Experience / Insights)
- Switch tenants via the client picker in the sidebar
- Access **Admin** sections: User Management, CUG Management, Data Sources, Dashboard Builder
- Edit page configuration (`Configure` button on every dashboard page)
- Create/update/delete dashboard annotations and chart comments on any tenant
- Delete any user's chart comment
- Create custom dashboards via the no-code builder

### INTERNAL_OPS
- View any client's dashboards
- Switch tenants via the client picker
- **Read-only** on admin and config pages
- Cannot post chart comments (covered under the comments allow-list below)
- Cannot edit page configuration

### KAM (Key Account Manager)
- View only the clients listed in `user_client_assignments` for that user
- Client picker shows only assigned tenants
- Can post / edit chart comments (acts as the "expert voice" on charts)
- Can create dashboard annotations on assigned tenants
- Cannot access admin pages

### CLIENT_ADMIN
- View only their own tenant's dashboards (no client picker, or picker is
  pinned to their CUG)
- Can post chart comments and dashboard annotations on their own tenant
- Cannot access admin pages, cannot switch tenants, cannot see other clients

### CLIENT_VIEWER
- View only their own tenant's dashboards (read-only)
- **Comments are hidden entirely** from the UI (see comments policy below)
- Cannot edit annotations, cannot post comments, cannot access admin pages

---

## Page-level access (UI)

Most pages render for any authenticated user; role gating only hides
*controls* on the page (e.g., the `Configure` button), not the data.

The pages that are role-gated at the route level:

| Route | Allowed roles |
|---|---|
| `/portal/admin/user-management` | `SUPER_ADMIN` |
| `/portal/admin/cug-management` | `SUPER_ADMIN` |
| `/portal/admin/data-sources` | `SUPER_ADMIN` |
| `/portal/admin/dashboards/*` | `SUPER_ADMIN` |
| `/portal/dashboard-builder` | `SUPER_ADMIN` |

These pages render a "Not authorized" state for non-SUPER_ADMIN users and
the underlying APIs return `403`.

The middleware (`middleware.ts`) only enforces the
*authentication* gate (logged in vs. not). All *role* checks are inside
each page/route.

---

## Comments policy (`/api/comments`)

Distinct from the dashboard annotation rules — comments are a chart-anchored
threaded discussion surface and have their own allow-list:

| Action | Roles allowed |
|---|---|
| Read comments (any chart) | `SUPER_ADMIN`, `INTERNAL_OPS`, `KAM`, `CLIENT_ADMIN` |
| Post a comment | `SUPER_ADMIN`, `KAM`, `CLIENT_ADMIN` |
| Delete a comment | The comment's author OR `SUPER_ADMIN` |
| `CLIENT_VIEWER` | Cannot see or post comments |
| `INTERNAL_OPS` | Read-only — can see comments, cannot post |

Comments are also **tenant-scoped**: the `client_id` on every row pins
each comment to a single tenant, and the API always filters by it.

---

## Per-tenant feature flags

Beyond roles, each tenant carries feature flags on the `clients` row:

| Column | Purpose |
|---|---|
| `has_ohc` | Show/hide OHC nav group + pages |
| `has_lsmp` | Show/hide LSMP nav group |
| `has_nps` | Show/hide NPS pages |
| `has_habit_app` | Show/hide app-engagement pages |
| `enabled_pages` | JSON array of page slugs visible to the tenant; `null` = all pages |
| `has_custom_dashboards` | Show user-built dashboards in nav |
| `metric_overrides` | Per-tenant tweaks to KPI calculation |
| `ai_provider` / `ai_context_notes` | Tenant-specific AI behavior |
| `draft_config` / `published_config` | Per-tenant dashboard layout snapshots |

These flags are **purely visibility/configuration** — they don't grant
extra permissions. A `CLIENT_VIEWER` whose tenant has `has_ohc=true` can
*see* OHC pages but still can't post comments.

---

## Adding a user to a tenant

### Internal user (KAM) — assign to one or more clients

1. Create the user with `role = KAM` (no `client_id`).
2. For each tenant they should access, create a row in
   `user_client_assignments` (`user_id`, `client_id`, `role = KAM`).
3. The app automatically scopes their client picker to those rows.

### Client user (CLIENT_ADMIN / CLIENT_VIEWER) — pin to one tenant

1. Create the user with `role = CLIENT_ADMIN` or `CLIENT_VIEWER` and set
   `users.client_id` to the tenant's ID.
2. **Do not** create rows in `user_client_assignments` for client users —
   their access is derived from `users.client_id` only.

The user-management page (`/portal/admin/user-management`, SUPER_ADMIN only)
is the supported way to do this; direct DB writes work but skip validation.

---

## Where the rules live

| Concern | File |
|---|---|
| Role enum | `prisma/schema.prisma` (lines 48-54) |
| Tenant scoping helpers | `lib/auth/session.ts` (`getSessionCugCode`, `getSessionCugId`) |
| Login / logout | `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts` |
| Session record / `useAuth` data | `app/api/auth/me/route.ts` |
| Auth gate (middleware) | `middleware.ts` |
| Comments policy | `app/api/comments/route.ts`, `app/api/comments/[id]/route.ts` |
| Admin route gates | Each route under `app/api/admin/**` and `app/portal/admin/**` checks `session.user.role === "SUPER_ADMIN"` |
| Annotations | `app/api/annotations/route.ts` |

---

## Testing checklist when changing RBAC

When you touch any of the files above, walk through this matrix at least
locally:

- [ ] CLIENT_VIEWER can log in, see only their own tenant, sees no admin
      links, sees no comment threads.
- [ ] CLIENT_ADMIN can post a comment on a chart; CLIENT_VIEWER cannot
      see it.
- [ ] KAM with one assignment sees only that tenant in the picker; second
      tenant returns 403 if attempted via URL.
- [ ] INTERNAL_OPS can switch tenants but the comment compose box is
      hidden / disabled.
- [ ] SUPER_ADMIN sees all admin pages and can edit page configuration.
- [ ] An API call with `?clientId=<other-tenant>` from a CLIENT_VIEWER
      returns the user's own tenant data, not the requested one.
