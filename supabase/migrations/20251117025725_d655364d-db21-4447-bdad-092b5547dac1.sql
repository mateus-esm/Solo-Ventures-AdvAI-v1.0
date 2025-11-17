-- Adicionar coluna de créditos avulsos para gerenciar recargas extras
ALTER TABLE public.equipes
ADD COLUMN IF NOT EXISTS creditos_avulsos INTEGER DEFAULT 0 NOT NULL;