# App Database Schema (Postgres)

This document describes the **application database** managed by Prisma.
It holds users, sessions, tenant config, dashboard annotations, chart
comments, and the no-code dashboard builder definitions.

> ⚠️ This is **not** the data warehouse. All dashboard data (visits,
> diagnoses, referrals, etc.) is read from the AWS RDS warehouse via a
> separate `DATA_WAREHOUSE_URL`. The app DB only holds metadata.

- **Engine**: PostgreSQL 14+
- **ORM**: Prisma — see `prisma/schema.prisma`
- **Connection env**: `DATABASE_URL`
- **Setup**: `npx prisma migrate deploy` (creates tables); `npx prisma db seed` (optional default super-admin)
- **Size**: kilobytes per tenant; only `sessions` grows over time (auto-clears via `expires_at`)

---

## Tables (10) + Enums (2)

### Auth & Users

#### `users` — application accounts
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `email` | text (unique) | login |
| `password_hash` | text | bcrypt |
| `name` | text | |
| `avatar_url` | text? | |
| `role` | enum `Role` | default `CLIENT_VIEWER` |
| `is_active` | bool | default true |
| `client_id` | uuid? → `clients.id` | null for internal users |
| `last_login_at` | timestamp? | |
| `created_at` / `updated_at` | timestamp | |

#### `sessions` — login tokens
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `user_id` | uuid → `users.id` (cascade) | |
| `token` | text (unique, indexed) | cookie value |
| `expires_at` | timestamp (indexed) | |
| `created_at` | timestamp | |

#### `Role` enum
- `SUPER_ADMIN`
- `INTERNAL_OPS`
- `KAM`
- `CLIENT_ADMIN`
- `CLIENT_VIEWER`

---

### Tenants (Clients)

#### `clients` — corporate tenants (HCL Technologies, Cisco, etc.)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `cug_id`, `cug_code`, `cug_name` | text | warehouse cug identifiers |
| `logo`, `industry` | text? | |
| `has_ohc`, `has_lsmp`, `has_nps`, `has_habit_app` | bool | feature flags |
| `enabled_pages` | jsonb? | array of page slugs visible to this CUG (null = all) |
| `has_custom_dashboards` | bool | builder-created dashboards visible |
| `ai_provider`, `ai_context_notes` | text? | per-tenant AI overrides |
| `metric_overrides` | jsonb? | per-tenant metric tweaks |
| `draft_config`, `published_config` | jsonb? | dashboard config snapshots |
| `config_published_at` | timestamp? | |
| `created_at` / `updated_at` | timestamp | |

#### `user_client_assignments` — KAM/internal user ↔ tenant access
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `user_id` | uuid → `users.id` (cascade) | |
| `client_id` | uuid → `clients.id` (cascade) | |
| `role` | enum `Role` | default `KAM` |

Unique on `(user_id, client_id)`.

---

### Annotations & Comments

#### `dashboard_annotations` — page-level notes from KAMs/admins
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `client_id` | uuid → `clients.id` | |
| `page_slug` | text | |
| `metric_key` | text? | |
| `filter_context` | jsonb? | |
| `comment_text` | text | |
| `comment_type` | enum `CommentType` | default `OBSERVATION` |
| `author_id` | uuid → `users.id` | |
| `is_visible_to_client` | bool | default true |
| `is_pinned` | bool | default false |
| `created_at` / `updated_at` | timestamp | |

#### `chart_comments` — chart-anchored comments with threaded replies
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `chart_id` | text | |
| `page_slug` | text | |
| `client_id` | uuid → `clients.id` | |
| `user_id` | uuid → `users.id` | |
| `text` | text | |
| `anchor` | jsonb | `{ xValue?, seriesName?, yValue?, segmentName?, cellX?, cellY?, chartType? }` |
| `parent_id` | uuid? → self | for threaded replies |
| `created_at` | timestamp | |

Indexed on `(chart_id, client_id)` and `(page_slug, client_id)`.

#### `CommentType` enum
- `OBSERVATION`
- `RECOMMENDATION`
- `ACTION_ITEM`
- `HIGHLIGHT`

---

### No-Code Dashboard Builder

#### `dashboard_definitions` — user-built dashboards
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `client_id` | uuid? → `clients.id` | null = global template |
| `slug` | text | |
| `title` | text | |
| `subtitle` | text? | |
| `icon` | text | default `BarChart3` |
| `nav_group` | text | default `Custom` |
| `config` | jsonb | full dashboard layout |
| `is_draft` | bool | default true |
| `published_at` | timestamp? | |
| `created_by` | uuid | |
| `created_at` / `updated_at` | timestamp | |

Unique on `(client_id, slug)`.

#### `dashboard_versions` — version history per dashboard
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `dashboard_id` | uuid → `dashboard_definitions.id` (cascade) | |
| `version` | int | |
| `config` | jsonb | snapshot |
| `title` | text | |
| `published_by` | uuid | |
| `published_at` | timestamp | default now |

Unique on `(dashboard_id, version)`.

#### `chart_definitions` — reusable chart templates
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `name` | text | |
| `config` | jsonb | |
| `is_template` | bool | default false |
| `created_by` | uuid | |
| `created_at` / `updated_at` | timestamp | |

#### `data_source_registry` — admin-editable warehouse table whitelist (DS-1)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `table` | text (unique) | warehouse table name |
| `label` | text | display name |
| `cug_column` | text | tenant filter column |
| `columns` | jsonb | column whitelist + types |
| `joins` | jsonb? | join graph |
| `enabled` | bool | default true |
| `created_at` / `updated_at` | timestamp | |

Replaces the old hardcoded `lib/config/data-sources.ts`. Super Admins
edit this through `/portal/admin/data-sources`.

---

## Deploy Checklist

1. Provision a Postgres 14+ instance (small — fits in a free tier).
2. Set `DATABASE_URL` in the deploy environment.
3. Run `npx prisma migrate deploy` once on first deploy to create the tables.
4. Optional: `npx prisma db seed` to insert a default super-admin user.
5. The deploy host needs network access to **both** the app DB *and* the warehouse RDS — see `DATA_WAREHOUSE_URL` env var.
