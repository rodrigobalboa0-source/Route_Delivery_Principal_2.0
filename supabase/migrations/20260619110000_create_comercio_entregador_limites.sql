CREATE TABLE public.comercio_entregador_limites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  entregador_id uuid REFERENCES public.entregadores(id) ON DELETE CASCADE,
  limite integer NOT NULL CHECK (limite >= 1),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);


CREATE UNIQUE INDEX comercio_entregador_limites_default_idx
  ON public.comercio_entregador_limites(cliente_id)
  WHERE entregador_id IS NULL;


CREATE UNIQUE INDEX comercio_entregador_limites_specific_idx
  ON public.comercio_entregador_limites(cliente_id, entregador_id)
  WHERE entregador_id IS NOT NULL;

ALTER TABLE public.comercio_entregador_limites ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_manage_comercio_limites"
  ON public.comercio_entregador_limites
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('admin', 'operador')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('admin', 'operador')
    )
  );