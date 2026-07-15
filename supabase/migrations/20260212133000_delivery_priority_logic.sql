ALTER TABLE public.nova_entrega 
ADD COLUMN IF NOT EXISTS liberado_em timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION public.calcular_liberacao_entrega()
RETURNS trigger AS $$
DECLARE
  max_delay integer;
BEGIN

  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;


  SELECT COALESCE(MAX(prioridade_tempo), 0)
  INTO max_delay
  FROM public.entregadores
  WHERE is_online = true AND prioridade_busca = true;


  NEW.liberado_em := NEW.created_at + (max_delay || ' seconds')::interval;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS trigger_calcular_liberacao_entrega ON public.nova_entrega;

CREATE TRIGGER trigger_calcular_liberacao_entrega
BEFORE INSERT ON public.nova_entrega
FOR EACH ROW
EXECUTE FUNCTION public.calcular_liberacao_entrega();