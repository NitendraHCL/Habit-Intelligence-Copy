-- ============================================================================
-- Habit Intelligence — COMPLETE database schema (application DB, not the
-- read-only warehouse). Generated verbatim from prisma/schema.prisma via:
--   npx prisma migrate diff --from-empty --to-schema-datamodel \
--       prisma/schema.prisma --script
-- so it matches exactly what the running app expects — nothing omitted.
--
-- Contents: 2 enums + 14 tables, with all columns, defaults, primary keys,
-- unique constraints, indexes, and foreign keys.
--
-- Tables: users, sessions, login_otps, password_reset_otps, password_history,
--   pending_password_changes, clients, user_client_assignments,
--   dashboard_annotations, chart_comments, dashboard_definitions,
--   dashboard_versions, chart_definitions, data_source_registry.
--
-- HOW TO APPLY ON REMOTE (EC2):
--   • Fresh / empty database  → run this file as-is:
--       psql "$DATABASE_URL" -f prisma/full-schema.sql
--   • EXISTING database (most cases) → DO NOT run this raw: the CREATE TABLE
--     statements are NOT "IF NOT EXISTS" and will error on tables that already
--     exist. Instead reconcile non-destructively with:
--       npx prisma db push
--     which adds only what's missing. Then ALWAYS:
--       npx prisma generate && npm run build && pm2 restart all
--     (regenerating the client + rebuilding is what was missed when the
--      first-login 500 appeared — see pending_password_changes below.)
--
-- NOTE: the first-login force-change flow writes to pending_password_changes.
-- If that table (or the regenerated Prisma client) is missing on a box, new
-- users 500 on first login while existing users are unaffected.
-- ============================================================================

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'INTERNAL_OPS', 'KAM', 'CLIENT_ADMIN', 'CLIENT_VIEWER');

-- CreateEnum
CREATE TYPE "CommentType" AS ENUM ('OBSERVATION', 'RECOMMENDATION', 'ACTION_ITEM', 'HIGHLIGHT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CLIENT_VIEWER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "client_id" TEXT,
    "last_login_at" TIMESTAMP(3),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_activity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_otps" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "pending_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resend_count" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_otps" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "pending_token" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resend_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_password_changes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "pending_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_password_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "cug_id" TEXT NOT NULL,
    "cug_code" TEXT,
    "cug_name" TEXT NOT NULL,
    "logo" TEXT,
    "industry" TEXT,
    "has_ohc" BOOLEAN NOT NULL DEFAULT false,
    "has_lsmp" BOOLEAN NOT NULL DEFAULT false,
    "has_nps" BOOLEAN NOT NULL DEFAULT false,
    "has_habit_app" BOOLEAN NOT NULL DEFAULT false,
    "enabled_pages" JSONB,
    "has_custom_dashboards" BOOLEAN NOT NULL DEFAULT false,
    "ai_provider" TEXT,
    "ai_context_notes" TEXT,
    "metric_overrides" JSONB,
    "draft_config" JSONB,
    "published_config" JSONB,
    "config_published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_client_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'KAM',

    CONSTRAINT "user_client_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_annotations" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "page_slug" TEXT NOT NULL,
    "metric_key" TEXT,
    "filter_context" JSONB,
    "comment_text" TEXT NOT NULL,
    "comment_type" "CommentType" NOT NULL DEFAULT 'OBSERVATION',
    "author_id" TEXT NOT NULL,
    "is_visible_to_client" BOOLEAN NOT NULL DEFAULT true,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_annotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_comments" (
    "id" TEXT NOT NULL,
    "chart_id" TEXT NOT NULL,
    "page_slug" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "anchor" JSONB NOT NULL,
    "parent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chart_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_definitions" (
    "id" TEXT NOT NULL,
    "client_id" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'BarChart3',
    "nav_group" TEXT NOT NULL DEFAULT 'Custom',
    "config" JSONB NOT NULL,
    "is_draft" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_versions" (
    "id" TEXT NOT NULL,
    "dashboard_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "title" TEXT NOT NULL,
    "published_by" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_definitions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "is_template" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chart_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_source_registry" (
    "id" TEXT NOT NULL,
    "table" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "cug_column" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "joins" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_source_registry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "sessions_last_activity_idx" ON "sessions"("last_activity");

-- CreateIndex
CREATE UNIQUE INDEX "login_otps_pending_token_key" ON "login_otps"("pending_token");

-- CreateIndex
CREATE INDEX "login_otps_user_id_idx" ON "login_otps"("user_id");

-- CreateIndex
CREATE INDEX "login_otps_expires_at_idx" ON "login_otps"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_otps_pending_token_key" ON "password_reset_otps"("pending_token");

-- CreateIndex
CREATE INDEX "password_reset_otps_user_id_idx" ON "password_reset_otps"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_otps_expires_at_idx" ON "password_reset_otps"("expires_at");

-- CreateIndex
CREATE INDEX "password_history_user_id_created_at_idx" ON "password_history"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pending_password_changes_pending_token_key" ON "pending_password_changes"("pending_token");

-- CreateIndex
CREATE INDEX "pending_password_changes_user_id_idx" ON "pending_password_changes"("user_id");

-- CreateIndex
CREATE INDEX "pending_password_changes_expires_at_idx" ON "pending_password_changes"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_client_assignments_user_id_client_id_key" ON "user_client_assignments"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "chart_comments_chart_id_client_id_idx" ON "chart_comments"("chart_id", "client_id");

-- CreateIndex
CREATE INDEX "chart_comments_page_slug_client_id_idx" ON "chart_comments"("page_slug", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_definitions_client_id_slug_key" ON "dashboard_definitions"("client_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_versions_dashboard_id_version_key" ON "dashboard_versions"("dashboard_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "data_source_registry_table_key" ON "data_source_registry"("table");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_otps" ADD CONSTRAINT "login_otps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_otps" ADD CONSTRAINT "password_reset_otps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_password_changes" ADD CONSTRAINT "pending_password_changes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_client_assignments" ADD CONSTRAINT "user_client_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_client_assignments" ADD CONSTRAINT "user_client_assignments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_annotations" ADD CONSTRAINT "dashboard_annotations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_annotations" ADD CONSTRAINT "dashboard_annotations_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_comments" ADD CONSTRAINT "chart_comments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_comments" ADD CONSTRAINT "chart_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_comments" ADD CONSTRAINT "chart_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "chart_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_definitions" ADD CONSTRAINT "dashboard_definitions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_versions" ADD CONSTRAINT "dashboard_versions_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboard_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

