ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS foto_url text,
  ADD COLUMN IF NOT EXISTS foto_base64 text;

ALTER TABLE public.entregadores
  ADD COLUMN IF NOT EXISTS foto_url text,
  ADD COLUMN IF NOT EXISTS foto_base64 text,
  ADD COLUMN IF NOT EXISTS cnh_foto_url text,
  ADD COLUMN IF NOT EXISTS cnh_foto_base64 text,
  ADD COLUMN IF NOT EXISTS comprovante_residencia_url text,
  ADD COLUMN IF NOT EXISTS comprovante_residencia_base64 text;