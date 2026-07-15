CREATE OR REPLACE FUNCTION public.get_cliente_public_info(cid uuid)
RETURNS TABLE (nome_completo text, foto_url text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT c.nome_completo, c.foto_url
  FROM public.clientes c
  WHERE c.id = cid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cliente_public_info(uuid) TO authenticated;
