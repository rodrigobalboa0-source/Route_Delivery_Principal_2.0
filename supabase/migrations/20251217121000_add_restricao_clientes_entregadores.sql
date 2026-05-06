alter table entregadores
add column restricao_clientes_modo text check (restricao_clientes_modo in ('todos', 'selecionados')) default 'todos',
add column clientes_permitidos jsonb default '[]'::jsonb;
