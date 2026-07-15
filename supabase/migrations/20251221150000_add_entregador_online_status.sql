ALTER TABLE public.entregadores 
ADD COLUMN IF NOT EXISTS is_online boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS current_latitude numeric,
ADD COLUMN IF NOT EXISTS current_longitude numeric,
ADD COLUMN IF NOT EXISTS last_location_update timestamptz;

CREATE INDEX IF NOT EXISTS idx_entregadores_is_online ON public.entregadores(is_online);