DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'view_entregador_ranking' 
      AND column_name = 'entregas_mes'
  ) THEN
    ALTER VIEW public.view_entregador_ranking 
      RENAME COLUMN entregas_mes TO entregas_semana;
  END IF;
END
$$;

CREATE OR REPLACE VIEW public.view_entregador_ranking AS
SELECT 
  e.id,
  e.nome_completo,
  e.foto_url,
  COUNT(ne.id) AS entregas_semana,
  COALESCE(AVG(ea.nota), 5) AS avaliacao_media
FROM public.entregadores e
LEFT JOIN public.nova_entrega ne ON ne.entregador_id = e.id 
  AND ne.status = 'entregue' 
  AND ne.created_at >= date_trunc('week', now())
  AND ne.created_at < date_trunc('week', now()) + interval '7 days'
LEFT JOIN public.entregador_avaliacoes ea ON ea.entregador_id = e.id
WHERE e.status = 'ativo'
GROUP BY e.id, e.nome_completo, e.foto_url;

GRANT SELECT ON public.view_entregador_ranking TO authenticated;
