ALTER TABLE IF EXISTS public.clientes
  ADD COLUMN IF NOT EXISTS segmento text,
  ADD COLUMN IF NOT EXISTS data_inicio date,
  ADD COLUMN IF NOT EXISTS razao_social text,
  ADD COLUMN IF NOT EXISTS nome_fantasia text,
  ADD COLUMN IF NOT EXISTS cadastro_via text,
  ADD COLUMN IF NOT EXISTS tipo_documento text CHECK (tipo_documento IN ('cpf','cnpj')),
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS lead_por text,
  ADD COLUMN IF NOT EXISTS franquia text,
  ADD COLUMN IF NOT EXISTS hub text,
  ADD COLUMN IF NOT EXISTS foto_url text,
  ADD COLUMN IF NOT EXISTS foto_base64 text;

CREATE INDEX IF NOT EXISTS idx_clientes_cnpj ON public.clientes(cnpj);
CREATE INDEX IF NOT EXISTS idx_clientes_segmento ON public.clientes(segmento);

