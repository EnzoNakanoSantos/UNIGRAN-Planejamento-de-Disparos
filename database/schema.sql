-- Schema principal do Supabase/PostgreSQL.
-- Execute este arquivo inteiro no SQL Editor do Supabase para criar um banco novo.

CREATE TABLE IF NOT EXISTS public.allowed_users (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT allowed_users_email_not_empty CHECK (TRIM(email) <> ''),
  CONSTRAINT allowed_users_role_not_empty CHECK (TRIM(role) <> '')
);

CREATE TABLE IF NOT EXISTS public.base_rules (
  id VARCHAR(80) PRIMARY KEY,
  campaign VARCHAR(160) NOT NULL DEFAULT '',
  main_base TEXT NOT NULL DEFAULT '',
  excluded_bases TEXT DEFAULT '',
  expected_action TEXT NOT NULL DEFAULT '',
  last_updated DATE,
  responsible VARCHAR(120) NOT NULL DEFAULT '',
  notes TEXT DEFAULT '',
  spreadsheet_attachment JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dispatches (
  id VARCHAR(80) PRIMARY KEY,
  channel VARCHAR(20) NOT NULL DEFAULT 'email',
  dispatch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  dispatch_time TIME,
  template_name TEXT DEFAULT '',
  chip VARCHAR(10) DEFAULT '',
  html_content TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  body TEXT DEFAULT '',
  attachments JSONB NOT NULL DEFAULT '[]'::JSONB,
  google_calendar_event_id TEXT,
  campaign VARCHAR(160) NOT NULL DEFAULT '',
  audience VARCHAR(180) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status VARCHAR(40) NOT NULL DEFAULT 'Planejado',
  base_rule_id VARCHAR(80) REFERENCES public.base_rules(id) ON DELETE SET NULL,
  responsible VARCHAR(120) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dispatch_chip_check CHECK (
    chip IN ('', 'EAD', 'DOU', 'CGR', 'U.S.A')
  ),
  CONSTRAINT dispatch_channel_check CHECK (
    channel IN ('email', 'whatsapp', 'html_email')
  ),
  CONSTRAINT dispatch_status_check CHECK (
    status IN (
      'Planejado',
      'Em produção',
      'Pronto para disparo',
      'Enviado',
      'Pausado',
      'Cancelado'
    )
  )
);

CREATE TABLE IF NOT EXISTS public.campaign_options (
  id VARCHAR(180) PRIMARY KEY,
  name VARCHAR(180) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audience_options (
  id VARCHAR(180) PRIMARY KEY,
  name VARCHAR(180) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.responsible_options (
  id VARCHAR(180) PRIMARY KEY,
  name VARCHAR(180) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.is_allowed_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.allowed_users u
    WHERE u.email = auth.email()
      AND u.active = TRUE
  ) AND auth.role() = 'authenticated';
$$;

REVOKE ALL ON FUNCTION public.is_allowed_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_allowed_user() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_allowed_user() TO authenticated;

DROP TRIGGER IF EXISTS set_allowed_users_updated_at ON public.allowed_users;
CREATE TRIGGER set_allowed_users_updated_at
BEFORE UPDATE ON public.allowed_users
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_base_rules_updated_at ON public.base_rules;
CREATE TRIGGER set_base_rules_updated_at
BEFORE UPDATE ON public.base_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_dispatches_updated_at ON public.dispatches;
CREATE TRIGGER set_dispatches_updated_at
BEFORE UPDATE ON public.dispatches
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_campaign_options_updated_at ON public.campaign_options;
CREATE TRIGGER set_campaign_options_updated_at
BEFORE UPDATE ON public.campaign_options
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_audience_options_updated_at ON public.audience_options;
CREATE TRIGGER set_audience_options_updated_at
BEFORE UPDATE ON public.audience_options
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_responsible_options_updated_at ON public.responsible_options;
CREATE TRIGGER set_responsible_options_updated_at
BEFORE UPDATE ON public.responsible_options
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_allowed_users_active ON public.allowed_users(active);
CREATE INDEX IF NOT EXISTS idx_dispatches_date ON public.dispatches(dispatch_date);
CREATE INDEX IF NOT EXISTS idx_dispatches_campaign ON public.dispatches(campaign);
CREATE INDEX IF NOT EXISTS idx_dispatches_audience ON public.dispatches(audience);
CREATE INDEX IF NOT EXISTS idx_dispatches_status ON public.dispatches(status);
CREATE INDEX IF NOT EXISTS idx_dispatches_base_rule_id ON public.dispatches(base_rule_id);
CREATE INDEX IF NOT EXISTS idx_base_rules_campaign ON public.base_rules(campaign);
CREATE INDEX IF NOT EXISTS idx_campaign_options_name ON public.campaign_options(name);
CREATE INDEX IF NOT EXISTS idx_audience_options_name ON public.audience_options(name);
CREATE INDEX IF NOT EXISTS idx_responsible_options_name ON public.responsible_options(name);

CREATE OR REPLACE VIEW public.base_rule_validation
WITH (security_invoker = true) AS
SELECT
  b.id,
  b.campaign,
  CASE
    WHEN TRIM(COALESCE(b.main_base, '')) = '' THEN 'red'
    WHEN TRIM(COALESCE(b.excluded_bases, '')) = '' THEN 'red'
    WHEN b.last_updated IS NULL THEN 'yellow'
    ELSE 'green'
  END AS validation_level,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN TRIM(COALESCE(b.main_base, '')) = '' THEN 'Base principal nao informada' END,
    CASE WHEN TRIM(COALESCE(b.excluded_bases, '')) = '' THEN 'Regra de exclusao nao configurada' END,
    CASE WHEN b.last_updated IS NULL THEN 'Data de atualizacao nao preenchida' END
  ], NULL) AS issues
FROM public.base_rules b;

CREATE OR REPLACE VIEW public.dispatch_validation
WITH (security_invoker = true) AS
SELECT
  d.id,
  d.dispatch_date,
  d.campaign,
  d.audience,
  d.status,
  CASE
    WHEN TRIM(COALESCE(d.audience, '')) = '' THEN 'red'
    WHEN b.id IS NULL THEN 'red'
    WHEN bv.validation_level = 'red' THEN 'red'
    WHEN b.last_updated IS NOT NULL AND d.dispatch_date - b.last_updated > 7 THEN 'yellow'
    WHEN bv.validation_level = 'yellow' THEN 'yellow'
    ELSE 'green'
  END AS validation_level,
  ARRAY_REMOVE(
    ARRAY[
      CASE WHEN TRIM(COALESCE(d.audience, '')) = '' THEN 'Publico nao definido' END,
      CASE WHEN b.id IS NULL THEN 'Base principal nao informada' END,
      CASE WHEN b.last_updated IS NOT NULL AND d.dispatch_date - b.last_updated > 7
        THEN 'Base atualizada ' || (d.dispatch_date - b.last_updated)::TEXT || ' dias antes do disparo'
      END
    ] || COALESCE(bv.issues, ARRAY[]::TEXT[]),
    NULL
  ) AS issues
FROM public.dispatches d
LEFT JOIN public.base_rules b ON b.id = d.base_rule_id
LEFT JOIN public.base_rule_validation bv ON bv.id = b.id;

CREATE OR REPLACE VIEW public.dispatch_overlaps
WITH (security_invoker = true) AS
SELECT
  d1.id AS dispatch_id,
  d1.dispatch_date,
  d1.campaign,
  d1.audience,
  d2.id AS conflicting_dispatch_id,
  d2.dispatch_date AS conflicting_dispatch_date,
  d2.campaign AS conflicting_campaign,
  d2.status AS conflicting_status
FROM public.dispatches d1
JOIN public.dispatches d2
  ON d1.id < d2.id
  AND LOWER(TRIM(d1.audience)) = LOWER(TRIM(d2.audience))
  AND ABS(d1.dispatch_date - d2.dispatch_date) <= 1
WHERE d1.status <> 'Cancelado'
  AND d2.status <> 'Cancelado';

REVOKE USAGE ON SCHEMA public FROM anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.allowed_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.base_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_options TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audience_options TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.responsible_options TO authenticated;
GRANT SELECT ON public.base_rule_validation TO authenticated;
GRANT SELECT ON public.dispatch_validation TO authenticated;
GRANT SELECT ON public.dispatch_overlaps TO authenticated;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.allowed_users FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.allowed_users FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.base_rules FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.dispatches FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.campaign_options FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.audience_options FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.responsible_options FROM anon;
REVOKE SELECT ON public.base_rule_validation FROM anon;
REVOKE SELECT ON public.dispatch_validation FROM anon;
REVOKE SELECT ON public.dispatch_overlaps FROM anon;

ALTER TABLE public.allowed_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.base_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audience_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responsible_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allowed users can read allowed users" ON public.allowed_users;
CREATE POLICY "Allowed users can read allowed users"
ON public.allowed_users
FOR SELECT
TO authenticated
USING (auth.email() = email AND active = TRUE);

DROP POLICY IF EXISTS "Allowed users can read base rules" ON public.base_rules;
DROP POLICY IF EXISTS "App can read base rules" ON public.base_rules;
CREATE POLICY "Allowed users can read base rules"
ON public.base_rules
FOR SELECT
TO authenticated
USING (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can insert base rules" ON public.base_rules;
DROP POLICY IF EXISTS "App can insert base rules" ON public.base_rules;
CREATE POLICY "Allowed users can insert base rules"
ON public.base_rules
FOR INSERT
TO authenticated
WITH CHECK (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can update base rules" ON public.base_rules;
DROP POLICY IF EXISTS "App can update base rules" ON public.base_rules;
CREATE POLICY "Allowed users can update base rules"
ON public.base_rules
FOR UPDATE
TO authenticated
USING (public.is_allowed_user())
WITH CHECK (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can delete base rules" ON public.base_rules;
DROP POLICY IF EXISTS "App can delete base rules" ON public.base_rules;
CREATE POLICY "Allowed users can delete base rules"
ON public.base_rules
FOR DELETE
TO authenticated
USING (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can read dispatches" ON public.dispatches;
DROP POLICY IF EXISTS "App can read dispatches" ON public.dispatches;
CREATE POLICY "Allowed users can read dispatches"
ON public.dispatches
FOR SELECT
TO authenticated
USING (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can insert dispatches" ON public.dispatches;
DROP POLICY IF EXISTS "App can insert dispatches" ON public.dispatches;
CREATE POLICY "Allowed users can insert dispatches"
ON public.dispatches
FOR INSERT
TO authenticated
WITH CHECK (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can update dispatches" ON public.dispatches;
DROP POLICY IF EXISTS "App can update dispatches" ON public.dispatches;
CREATE POLICY "Allowed users can update dispatches"
ON public.dispatches
FOR UPDATE
TO authenticated
USING (public.is_allowed_user())
WITH CHECK (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can delete dispatches" ON public.dispatches;
DROP POLICY IF EXISTS "App can delete dispatches" ON public.dispatches;
CREATE POLICY "Allowed users can delete dispatches"
ON public.dispatches
FOR DELETE
TO authenticated
USING (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can read campaign options" ON public.campaign_options;
DROP POLICY IF EXISTS "App can read campaign options" ON public.campaign_options;
CREATE POLICY "Allowed users can read campaign options"
ON public.campaign_options
FOR SELECT
TO authenticated
USING (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can insert campaign options" ON public.campaign_options;
DROP POLICY IF EXISTS "App can insert campaign options" ON public.campaign_options;
CREATE POLICY "Allowed users can insert campaign options"
ON public.campaign_options
FOR INSERT
TO authenticated
WITH CHECK (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can update campaign options" ON public.campaign_options;
DROP POLICY IF EXISTS "App can update campaign options" ON public.campaign_options;
CREATE POLICY "Allowed users can update campaign options"
ON public.campaign_options
FOR UPDATE
TO authenticated
USING (public.is_allowed_user())
WITH CHECK (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can delete campaign options" ON public.campaign_options;
DROP POLICY IF EXISTS "App can delete campaign options" ON public.campaign_options;
CREATE POLICY "Allowed users can delete campaign options"
ON public.campaign_options
FOR DELETE
TO authenticated
USING (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can read audience options" ON public.audience_options;
DROP POLICY IF EXISTS "App can read audience options" ON public.audience_options;
CREATE POLICY "Allowed users can read audience options"
ON public.audience_options
FOR SELECT
TO authenticated
USING (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can insert audience options" ON public.audience_options;
DROP POLICY IF EXISTS "App can insert audience options" ON public.audience_options;
CREATE POLICY "Allowed users can insert audience options"
ON public.audience_options
FOR INSERT
TO authenticated
WITH CHECK (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can update audience options" ON public.audience_options;
DROP POLICY IF EXISTS "App can update audience options" ON public.audience_options;
CREATE POLICY "Allowed users can update audience options"
ON public.audience_options
FOR UPDATE
TO authenticated
USING (public.is_allowed_user())
WITH CHECK (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can delete audience options" ON public.audience_options;
DROP POLICY IF EXISTS "App can delete audience options" ON public.audience_options;
CREATE POLICY "Allowed users can delete audience options"
ON public.audience_options
FOR DELETE
TO authenticated
USING (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can read responsible options" ON public.responsible_options;
DROP POLICY IF EXISTS "App can read responsible options" ON public.responsible_options;
CREATE POLICY "Allowed users can read responsible options"
ON public.responsible_options
FOR SELECT
TO authenticated
USING (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can insert responsible options" ON public.responsible_options;
DROP POLICY IF EXISTS "App can insert responsible options" ON public.responsible_options;
CREATE POLICY "Allowed users can insert responsible options"
ON public.responsible_options
FOR INSERT
TO authenticated
WITH CHECK (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can update responsible options" ON public.responsible_options;
DROP POLICY IF EXISTS "App can update responsible options" ON public.responsible_options;
CREATE POLICY "Allowed users can update responsible options"
ON public.responsible_options
FOR UPDATE
TO authenticated
USING (public.is_allowed_user())
WITH CHECK (public.is_allowed_user());

DROP POLICY IF EXISTS "Allowed users can delete responsible options" ON public.responsible_options;
DROP POLICY IF EXISTS "App can delete responsible options" ON public.responsible_options;
CREATE POLICY "Allowed users can delete responsible options"
ON public.responsible_options
FOR DELETE
TO authenticated
USING (public.is_allowed_user());

INSERT INTO public.allowed_users (email, name, role, active)
VALUES
  ('mktdigital02.ead@unigran.br', 'Enzo Nakano', 'admin', TRUE),
  ('mktdigital01.ead@unigran.br', 'Raquel Kuhnen', 'admin', TRUE),
  ('mktdigital06.ead@unigran.br', 'Matheus Salazar', 'admin', TRUE)
ON CONFLICT (email)
DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  active = EXCLUDED.active,
  updated_at = NOW();
