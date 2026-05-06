ALTER TABLE public.integracoes_ifood
DROP COLUMN IF EXISTS client_id,
DROP COLUMN IF EXISTS client_secret;

ALTER TABLE public.integracoes_ifood
ADD COLUMN IF NOT EXISTS access_token text,
ADD COLUMN IF NOT EXISTS refresh_token text,
ADD COLUMN IF NOT EXISTS token_expires_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS authorization_code_used text;

CREATE INDEX IF NOT EXISTS idx_integracoes_ifood_merchant_id ON public.integracoes_ifood(merchant_id);