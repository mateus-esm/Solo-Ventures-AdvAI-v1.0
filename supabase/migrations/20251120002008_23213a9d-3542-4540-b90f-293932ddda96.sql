-- Adicionar constraint UNIQUE para permitir upsert em consumo_creditos
-- Isso garante que cada equipe tenha apenas um registro por período

ALTER TABLE public.consumo_creditos
ADD CONSTRAINT consumo_creditos_equipe_periodo_key UNIQUE (equipe_id, periodo);

-- Comentário explicativo
COMMENT ON CONSTRAINT consumo_creditos_equipe_periodo_key ON public.consumo_creditos 
IS 'Garante que cada equipe tenha apenas um registro de consumo por período (YYYY-MM)';