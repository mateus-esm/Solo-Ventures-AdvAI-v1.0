-- Script para resetar créditos do Walter Inglez (teste)
-- Este script zera o consumo de créditos para permitir um novo início

-- Encontra a equipe do Walter e reseta o consumo
UPDATE consumo_creditos
SET creditos_utilizados = 0,
    data_consumo = now(),
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{manual_reset}',
      to_jsonb(now()::text)
    )
WHERE equipe_id IN (
  SELECT id FROM equipes WHERE nome_cliente ILIKE '%walter%inglez%'
);

-- Log da operação
DO $$
DECLARE
  equipe_nome TEXT;
BEGIN
  SELECT nome_cliente INTO equipe_nome 
  FROM equipes 
  WHERE nome_cliente ILIKE '%walter%inglez%' 
  LIMIT 1;
  
  RAISE NOTICE 'Créditos resetados para a equipe: %', equipe_nome;
END $$;