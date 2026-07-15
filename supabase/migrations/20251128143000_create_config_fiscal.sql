CREATE TABLE IF NOT EXISTS public.config_fiscal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  cert_pfx_base64 text,
  cert_password text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.config_fiscal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth can select own config" ON public.config_fiscal;
CREATE POLICY "auth can select own config" ON public.config_fiscal FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "auth can insert own config" ON public.config_fiscal;
CREATE POLICY "auth can insert own config" ON public.config_fiscal FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "auth can update own config" ON public.config_fiscal;
CREATE POLICY "auth can update own config" ON public.config_fiscal FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "auth can delete own config" ON public.config_fiscal;
CREATE POLICY "auth can delete own config" ON public.config_fiscal FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_config_fiscal_user ON public.config_fiscal(user_id);