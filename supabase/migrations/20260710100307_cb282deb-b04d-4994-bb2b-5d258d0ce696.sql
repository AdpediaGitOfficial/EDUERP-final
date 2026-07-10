
-- ============================================================
-- ROLES
-- ============================================================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hr';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'reception';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'fleet_manager';
