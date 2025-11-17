-- Atualizar planos com novos valores e funcionalidades

-- Atualiza Plano Starter (ID 1)
UPDATE public.planos
SET 
  preco_mensal = 150, 
  limite_creditos = 1000, 
  limite_usuarios = 3, 
  funcionalidades = ARRAY['Setup do Agente', 'Acesso ao Chat', 'Acesso ao CRM (Read-Only)', 'Suporte para ajustes (limitado)']
WHERE id = 1;

-- Atualiza Plano Scale (ID 2)
UPDATE public.planos
SET 
  nome = 'Solo Scale', 
  preco_mensal = 400, 
  limite_creditos = 3000, 
  limite_usuarios = 5, 
  funcionalidades = ARRAY['Tudo do Starter', 'Dashboard de Performance', 'Billing', 'Suporte Builder Mode (1h mensal)']
WHERE id = 2;

-- Atualiza Plano Pro (ID 3)
UPDATE public.planos
SET 
  nome = 'Solo Pro', 
  preco_mensal = 1000, 
  limite_creditos = 10000, 
  limite_usuarios = NULL, 
  funcionalidades = ARRAY['Tudo do Scale', 'Usuários Ilimitados', 'Suporte Builder Mode (3h mensal)']
WHERE id = 3;