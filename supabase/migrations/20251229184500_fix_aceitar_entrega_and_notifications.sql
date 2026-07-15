CREATE TABLE IF NOT EXISTS public.entregador_notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entregador_id uuid REFERENCES public.entregadores(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  mensagem text NOT NULL,
  lida boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);


ALTER TABLE public.entregador_notificacoes ENABLE ROW LEVEL SECURITY;


DO $$ 
BEGIN
    
    DROP POLICY IF EXISTS "Entregadores can select their own notifications" ON public.entregador_notificacoes;
    DROP POLICY IF EXISTS "Entregadores can update their own notifications (mark as read)" ON public.entregador_notificacoes;
    
    
    CREATE POLICY "Entregadores can select their own notifications" 
      ON public.entregador_notificacoes 
      FOR SELECT 
      TO authenticated 
      USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid() AND u.role = 'entregador' 
          AND (
            SELECT e.id FROM public.entregadores e WHERE lower(e.email) = lower(u.email)
          ) = public.entregador_notificacoes.entregador_id
        )
      );

    CREATE POLICY "Entregadores can update their own notifications (mark as read)" 
      ON public.entregador_notificacoes 
      FOR UPDATE
      TO authenticated 
      USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid() AND u.role = 'entregador' 
          AND (
            SELECT e.id FROM public.entregadores e WHERE lower(e.email) = lower(u.email)
          ) = public.entregador_notificacoes.entregador_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid() AND u.role = 'entregador' 
          AND (
            SELECT e.id FROM public.entregadores e WHERE lower(e.email) = lower(u.email)
          ) = public.entregador_notificacoes.entregador_id
        )
      );
END $$;


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