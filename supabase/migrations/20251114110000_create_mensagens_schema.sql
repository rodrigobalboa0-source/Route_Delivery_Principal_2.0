CREATE TABLE IF NOT EXISTS public.mensagens_entregadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entregador_id uuid REFERENCES public.entregadores(id) ON DELETE CASCADE,
  canal text CHECK (canal IN ('push')) NOT NULL,
  titulo text,
  corpo text,
  status text CHECK (status IN ('pendente','enviado','erro')) DEFAULT 'pendente',
  erro text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.mensagens_entregadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select mensagens_entregadores" ON public.mensagens_entregadores FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert mensagens_entregadores" ON public.mensagens_entregadores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update mensagens_entregadores" ON public.mensagens_entregadores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete mensagens_entregadores" ON public.mensagens_entregadores FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_msg_entregador_id ON public.mensagens_entregadores(entregador_id);
CREATE INDEX IF NOT EXISTS idx_msg_entregador_status ON public.mensagens_entregadores(status);

CREATE TABLE IF NOT EXISTS public.mensagens_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  canal text CHECK (canal IN ('email','sms','push')) NOT NULL,
  titulo text,
  corpo text,
  status text CHECK (status IN ('pendente','enviado','erro')) DEFAULT 'pendente',
  erro text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.mensagens_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select mensagens_clientes" ON public.mensagens_clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert mensagens_clientes" ON public.mensagens_clientes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update mensagens_clientes" ON public.mensagens_clientes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete mensagens_clientes" ON public.mensagens_clientes FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_msg_cliente_id ON public.mensagens_clientes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_msg_cliente_status ON public.mensagens_clientes(status);

CREATE TABLE IF NOT EXISTS public.conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_alvo text CHECK (tipo_alvo IN ('entregador','cliente')) NOT NULL,
  alvo_id uuid NOT NULL,
  assunto text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.conversas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select conversas" ON public.conversas FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert conversas" ON public.conversas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update conversas" ON public.conversas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete conversas" ON public.conversas FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_conversas_alvo ON public.conversas(tipo_alvo, alvo_id);

CREATE TABLE IF NOT EXISTS public.conversa_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid REFERENCES public.conversas(id) ON DELETE CASCADE,
  autor_tipo text CHECK (autor_tipo IN ('operador','entregador','cliente','sistema')),
  canal text CHECK (canal IN ('email','sms','push','app')),
  conteudo text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.conversa_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select conversa_mensagens" ON public.conversa_mensagens FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert conversa_mensagens" ON public.conversa_mensagens FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update conversa_mensagens" ON public.conversa_mensagens FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete conversa_mensagens" ON public.conversa_mensagens FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_conversa_mensagens_conversa ON public.conversa_mensagens(conversa_id);
