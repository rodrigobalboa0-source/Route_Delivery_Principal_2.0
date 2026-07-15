ALTER TABLE public.entregadores
ADD COLUMN IF NOT EXISTS fcm_token text;

CREATE INDEX IF NOT EXISTS idx_entregadores_fcm_token ON public.entregadores(fcm_token);
