CREATE TABLE IF NOT EXISTS public.entregador_notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entregador_id uuid REFERENCES public.entregadores(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  mensagem text NOT NULL,
  lida boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.entregador_notificacoes ENABLE ROW LEVEL SECURITY;

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