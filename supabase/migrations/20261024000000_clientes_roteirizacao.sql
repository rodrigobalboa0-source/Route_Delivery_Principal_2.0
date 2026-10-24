-- Roteirização por loja (aba Configurações / Operação): por loja, ligar/desligar
-- a roteirização automática e definir quantos pedidos entram em cada rota.
alter table public.clientes add column if not exists roteirizacao_automatica boolean not null default false;
alter table public.clientes add column if not exists roteirizacao_qtd_pedidos integer not null default 1;
