CREATE TABLE IF NOT EXISTS delivery_persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'inativo' CHECK (status IN ('disponivel', 'em_entrega', 'inativo')),
  is_online boolean NOT NULL DEFAULT false,
  current_latitude numeric,
  current_longitude numeric,
  last_location_update timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_person_id uuid REFERENCES delivery_persons(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  delivery_address text NOT NULL,
  delivery_latitude numeric NOT NULL,
  delivery_longitude numeric NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_rota', 'entregue', 'cancelada')),
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

ALTER TABLE delivery_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view delivery persons"
  ON delivery_persons FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert delivery persons"
  ON delivery_persons FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update delivery persons"
  ON delivery_persons FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete delivery persons"
  ON delivery_persons FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view deliveries"
  ON deliveries FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert deliveries"
  ON deliveries FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update deliveries"
  ON deliveries FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete deliveries"
  ON deliveries FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_delivery_persons_status ON delivery_persons(status);
CREATE INDEX IF NOT EXISTS idx_delivery_persons_is_online ON delivery_persons(is_online);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_delivery_person ON deliveries(delivery_person_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_delivery_persons_updated_at
  BEFORE UPDATE ON delivery_persons
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_completo text NOT NULL,
  cpf text,
  data_nascimento date,
  telefone text,
  email text UNIQUE,
  metodo_pagamento_preferido text,
  observacoes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select clientes" ON public.clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert clientes" ON public.clientes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update clientes" ON public.clientes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete clientes" ON public.clientes FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_clientes_email ON public.clientes(email);

CREATE TABLE IF NOT EXISTS public.cliente_enderecos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  cep text,
  rua text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  referencia_entrega text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.cliente_enderecos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select cliente_enderecos" ON public.cliente_enderecos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert cliente_enderecos" ON public.cliente_enderecos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update cliente_enderecos" ON public.cliente_enderecos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete cliente_enderecos" ON public.cliente_enderecos FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_cliente_enderecos_cliente ON public.cliente_enderecos(cliente_id);

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.contas_gerenciais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_completo text NOT NULL,
  cargo text,
  email_acesso text UNIQUE,
  telefone text,
  usuario_login text UNIQUE,
  senha_hash text,
  nivel_permissao text CHECK (nivel_permissao IN ('admin_geral','supervisor','financeiro','atendimento','operacional')) DEFAULT 'operacional',
  status text CHECK (status IN ('ativa','inativa')) DEFAULT 'ativa',
  unidade_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.contas_gerenciais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select contas" ON public.contas_gerenciais FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert contas" ON public.contas_gerenciais FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update contas" ON public.contas_gerenciais FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete contas" ON public.contas_gerenciais FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_contas_email ON public.contas_gerenciais(email_acesso);
CREATE INDEX IF NOT EXISTS idx_contas_usuario ON public.contas_gerenciais(usuario_login);

CREATE TABLE IF NOT EXISTS public.contas_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id uuid REFERENCES public.contas_gerenciais(id) ON DELETE CASCADE,
  acao text,
  detalhes jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.contas_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select contas_logs" ON public.contas_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert contas_logs" ON public.contas_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can delete contas_logs" ON public.contas_logs FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_contas_logs_conta ON public.contas_logs(conta_id);

CREATE TABLE IF NOT EXISTS public.entregadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_completo text NOT NULL,
  cpf text,
  rg text,
  data_nascimento date,
  telefone text,
  email text,
  veiculo_tipo text CHECK (veiculo_tipo IN ('moto','bike','carro')),
  veiculo_modelo text,
  veiculo_placa text,
  veiculo_ano int,
  cnh_valida boolean,
  tipo_entrega text CHECK (tipo_entrega IN ('proprio','terceirizado','parceiro')),
  taxa_entrega numeric,
  status text CHECK (status IN ('ativo','inativo')) DEFAULT 'inativo',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.entregadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select entregadores" ON public.entregadores FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert entregadores" ON public.entregadores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update entregadores" ON public.entregadores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete entregadores" ON public.entregadores FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_entregadores_status ON public.entregadores(status);

CREATE TABLE IF NOT EXISTS public.entregador_regioes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entregador_id uuid REFERENCES public.entregadores(id) ON DELETE CASCADE,
  regiao text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.entregador_regioes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select entregador_regioes" ON public.entregador_regioes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert entregador_regioes" ON public.entregador_regioes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can delete entregador_regioes" ON public.entregador_regioes FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.entregador_turnos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entregador_id uuid REFERENCES public.entregadores(id) ON DELETE CASCADE,
  dias text,
  inicio time,
  fim time
);
ALTER TABLE public.entregador_turnos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select entregador_turnos" ON public.entregador_turnos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert entregador_turnos" ON public.entregador_turnos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can delete entregador_turnos" ON public.entregador_turnos FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.entregador_avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entregador_id uuid REFERENCES public.entregadores(id) ON DELETE CASCADE,
  nota numeric,
  comentario text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.entregador_avaliacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select entregador_avaliacoes" ON public.entregador_avaliacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert entregador_avaliacoes" ON public.entregador_avaliacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can delete entregador_avaliacoes" ON public.entregador_avaliacoes FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.grupos_operacionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  tipo_funcao text CHECK (tipo_funcao IN ('operacional','administrativo','logistica')),
  permissoes jsonb,
  responsavel_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  regras_internas text,
  limite_permissoes jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.grupos_operacionais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select grupos" ON public.grupos_operacionais FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert grupos" ON public.grupos_operacionais FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update grupos" ON public.grupos_operacionais FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete grupos" ON public.grupos_operacionais FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_grupos_tipo ON public.grupos_operacionais(tipo_funcao);

CREATE TABLE IF NOT EXISTS public.grupo_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid REFERENCES public.grupos_operacionais(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE
);
ALTER TABLE public.grupo_usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select grupo_usuarios" ON public.grupo_usuarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert grupo_usuarios" ON public.grupo_usuarios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can delete grupo_usuarios" ON public.grupo_usuarios FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.grupo_horarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid REFERENCES public.grupos_operacionais(id) ON DELETE CASCADE,
  dia text,
  inicio time,
  fim time
);
ALTER TABLE public.grupo_horarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select grupo_horarios" ON public.grupo_horarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert grupo_horarios" ON public.grupo_horarios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can delete grupo_horarios" ON public.grupo_horarios FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.modais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text CHECK (tipo IN ('moto','carro','bike','outro')) NOT NULL,
  descricao text,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.modais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select modais" ON public.modais FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert modais" ON public.modais FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update modais" ON public.modais FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete modais" ON public.modais FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_modais_tipo ON public.modais(tipo);
CREATE INDEX IF NOT EXISTS idx_modais_ativo ON public.modais(ativo);

CREATE TABLE IF NOT EXISTS public.precificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modal_tipo text CHECK (modal_tipo IN ('moto','carro','bike','outro')) NOT NULL,
  taxa_base numeric,
  valor_por_km numeric,
  valor_por_minuto numeric,
  taxa_minima numeric,
  ativa boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.precificacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select precificacoes" ON public.precificacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert precificacoes" ON public.precificacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update precificacoes" ON public.precificacoes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete precificacoes" ON public.precificacoes FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_precificacoes_modal ON public.precificacoes(modal_tipo);
CREATE INDEX IF NOT EXISTS idx_precificacoes_ativa ON public.precificacoes(ativa);

CREATE TABLE IF NOT EXISTS public.preco_espera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modal_tipo text CHECK (modal_tipo IN ('moto','carro','bike','outro')) NOT NULL,
  valor_por_minuto numeric NOT NULL,
  ativa boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.preco_espera ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select preco_espera" ON public.preco_espera FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert preco_espera" ON public.preco_espera FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update preco_espera" ON public.preco_espera FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete preco_espera" ON public.preco_espera FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_preco_espera_modal ON public.preco_espera(modal_tipo);
CREATE INDEX IF NOT EXISTS idx_preco_espera_ativa ON public.preco_espera(ativa);

CREATE TABLE IF NOT EXISTS public.preco_dinamico_demanda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text,
  multiplicador numeric,
  criterio text,
  ativa boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.preco_dinamico_demanda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select preco_dinamico_demanda" ON public.preco_dinamico_demanda FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert preco_dinamico_demanda" ON public.preco_dinamico_demanda FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update preco_dinamico_demanda" ON public.preco_dinamico_demanda FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete preco_dinamico_demanda" ON public.preco_dinamico_demanda FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_preco_dinamico_demanda_ativa ON public.preco_dinamico_demanda(ativa);

CREATE TABLE IF NOT EXISTS public.preco_dinamico_entregador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entregador_id uuid REFERENCES public.entregadores(id) ON DELETE CASCADE,
  multiplicador numeric,
  ativa boolean DEFAULT true,
  observacao text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.preco_dinamico_entregador ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select preco_dinamico_entregador" ON public.preco_dinamico_entregador FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert preco_dinamico_entregador" ON public.preco_dinamico_entregador FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update preco_dinamico_entregador" ON public.preco_dinamico_entregador FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete preco_dinamico_entregador" ON public.preco_dinamico_entregador FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_preco_dinamico_entregador_id ON public.preco_dinamico_entregador(entregador_id);
CREATE INDEX IF NOT EXISTS idx_preco_dinamico_entregador_ativa ON public.preco_dinamico_entregador(ativa);

CREATE TABLE IF NOT EXISTS public.servicos_opcionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text,
  descricao text,
  valor_adicional numeric,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.servicos_opcionais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select servicos_opcionais" ON public.servicos_opcionais FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert servicos_opcionais" ON public.servicos_opcionais FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update servicos_opcionais" ON public.servicos_opcionais FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete servicos_opcionais" ON public.servicos_opcionais FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_servicos_opcionais_ativo ON public.servicos_opcionais(ativo);
