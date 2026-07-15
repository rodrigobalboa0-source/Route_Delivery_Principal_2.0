
INSERT INTO public.contas_gerenciais (nome_completo, email_acesso, nivel_permissao, status)
SELECT 
  coalesce(full_name, email), 
  email, 
  'admin_geral', 
  'ativa'
FROM public.users
WHERE role = 'operador'
ON CONFLICT (email_acesso) DO NOTHING;
