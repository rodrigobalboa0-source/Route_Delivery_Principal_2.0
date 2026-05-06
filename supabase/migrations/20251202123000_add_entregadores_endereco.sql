ALTER TABLE public.entregadores
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS rua text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS complemento text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS cidade text;

CREATE INDEX IF NOT EXISTS idx_entregadores_cep ON public.entregadores(cep);
CREATE INDEX IF NOT EXISTS idx_entregadores_cidade ON public.entregadores(cidade);
