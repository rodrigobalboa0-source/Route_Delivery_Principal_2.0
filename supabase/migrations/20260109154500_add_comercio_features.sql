ALTER TABLE public.clientes 
ADD COLUMN IF NOT EXISTS saldo_creditos numeric(10,2) DEFAULT 0.00;


CREATE TABLE IF NOT EXISTS public.creditos_clientes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
    valor numeric(10,2) NOT NULL,
    tipo text CHECK (tipo IN ('compra', 'uso', 'ajuste', 'estorno')),
    descricao text,
    saldo_anterior numeric(10,2) NOT NULL,
    saldo_novo numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by uuid REFERENCES auth.users(id)
);


CREATE TABLE IF NOT EXISTS public.faturamento_clientes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
    periodo_inicio date,
    periodo_fim date,
    valor_total numeric(10,2) NOT NULL,
    status text CHECK (status IN ('pendente', 'pago', 'vencido', 'cancelado')) DEFAULT 'pendente',
    vencimento date,
    link_boleto text,
    descricao text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


ALTER TABLE public.creditos_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faturamento_clientes ENABLE ROW LEVEL SECURITY;


CREATE POLICY creditos_clientes_select ON public.creditos_clientes
    FOR SELECT TO authenticated
    USING (
        public.is_admin() OR 
        (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'cliente' AND u.cliente_id = creditos_clientes.cliente_id))
    );


CREATE POLICY faturamento_clientes_select ON public.faturamento_clientes
    FOR SELECT TO authenticated
    USING (
        public.is_admin() OR 
        (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'cliente' AND u.cliente_id = faturamento_clientes.cliente_id))
    );