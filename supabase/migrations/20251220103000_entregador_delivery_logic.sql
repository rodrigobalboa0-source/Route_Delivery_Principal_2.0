DROP POLICY IF EXISTS nova_entrega_tenant_select ON public.nova_entrega;

CREATE POLICY nova_entrega_tenant_select ON public.nova_entrega
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON lower(c.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND c.id = public.nova_entrega.cliente_id
    )
    OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.entregadores e ON lower(e.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND (
        e.id = public.nova_entrega.entregador_id 
        OR (public.nova_entrega.entregador_id IS NULL AND public.nova_entrega.status = 'criada')
      )
    )
  );

CREATE OR REPLACE FUNCTION public.aceitar_entrega(entrega_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_entregador_id uuid;
  v_entrega record;
BEGIN
  v_user_id := auth.uid();
  
  
  SELECT e.id INTO v_entregador_id
  FROM public.users u
  JOIN public.entregadores e ON lower(e.email) = lower(u.email)
  WHERE u.id = v_user_id AND u.role = 'entregador';

  IF v_entregador_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Usuário não é um entregador válido.');
  END IF;

  
  SELECT * INTO v_entrega FROM public.nova_entrega WHERE id = entrega_id;
  
  IF v_entrega.id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Entrega não encontrada.');
  END IF;

  IF v_entrega.entregador_id IS NOT NULL THEN
    RETURN json_build_object('success', false, 'message', 'Entrega já atribuída a outro entregador.');
  END IF;

  IF v_entrega.status <> 'criada' THEN
    RETURN json_build_object('success', false, 'message', 'Entrega não está disponível.');
  END IF;

  
  UPDATE public.nova_entrega
  SET entregador_id = v_entregador_id,
      status = 'atribuida',
      updated_at = now()
  WHERE id = entrega_id;
  
  
  INSERT INTO public.entregador_notificacoes (entregador_id, titulo, mensagem)
  VALUES (v_entregador_id, 'Entrega Aceita', 'Você aceitou a entrega #' || substring(cast(entrega_id as text), 1, 8));

  RETURN json_build_object('success', true, 'message', 'Entrega aceita com sucesso!');
END;
$$;

CREATE OR REPLACE VIEW public.view_entregador_ranking AS
SELECT 
  e.id,
  e.nome_completo,
  e.foto_url,
  COUNT(ne.id) as entregas_mes,
  COALESCE(AVG(ea.nota), 5) as avaliacao_media
FROM public.entregadores e
LEFT JOIN public.nova_entrega ne ON ne.entregador_id = e.id 
  AND ne.status = 'entregue' 
  AND date_trunc('month', ne.created_at) = date_trunc('month', now())
LEFT JOIN public.entregador_avaliacoes ea ON ea.entregador_id = e.id
WHERE e.status = 'ativo'
GROUP BY e.id, e.nome_completo, e.foto_url;

GRANT SELECT ON public.view_entregador_ranking TO authenticated;