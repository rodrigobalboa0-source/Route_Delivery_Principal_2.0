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
  
  -- Get entregador_id
  SELECT e.id INTO v_entregador_id
  FROM public.users u
  JOIN public.entregadores e ON lower(e.email) = lower(u.email)
  WHERE u.id = v_user_id AND u.role = 'entregador';

  IF v_entregador_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Usuário não é um entregador válido.');
  END IF;

  -- Get delivery
  SELECT * INTO v_entrega FROM public.nova_entrega WHERE id = entrega_id;
  
  IF v_entrega.id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Entrega não encontrada.');
  END IF;

  -- Validation
  IF v_entrega.entregador_id = v_entregador_id THEN
      RETURN json_build_object('success', true, 'message', 'Entrega já atribuída a você.');
  END IF;

  IF v_entrega.entregador_id IS NOT NULL THEN
    RETURN json_build_object('success', false, 'message', 'Entrega já atribuída a outro entregador.');
  END IF;

  IF v_entrega.status <> 'criada' THEN
    RETURN json_build_object('success', false, 'message', 'Entrega não está disponível.');
  END IF;

  -- Update with atribuicao_modo = 'manual'
  UPDATE public.nova_entrega
  SET entregador_id = v_entregador_id,
      status = 'atribuida',
      atribuicao_modo = 'manual',
      updated_at = now()
  WHERE id = entrega_id;

  RETURN json_build_object('success', true, 'message', 'Entrega aceita com sucesso!');
END $$;
