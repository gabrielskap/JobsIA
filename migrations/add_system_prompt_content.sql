-- Migration: Add missing content column to JobsIA_system_prompts
-- The table was renamed from system_prompts but the content column was never created.

ALTER TABLE "JobsIA_system_prompts"
  ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
