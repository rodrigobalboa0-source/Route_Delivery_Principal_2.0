CREATE OR REPLACE FUNCTION public.sync_entregador_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN

  UPDATE public.users
  SET role = 'entregador'
  WHERE lower(email) = lower(NEW.email) AND role != 'entregador';
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_entregador_created ON public.entregadores;
CREATE TRIGGER on_entregador_created
  AFTER INSERT ON public.entregadores
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_entregador_role();


UPDATE public.users u
SET role = 'entregador'
FROM public.entregadores e
WHERE lower(u.email) = lower(e.email)
AND u.role != 'entregador'
AND u.role != 'operador';