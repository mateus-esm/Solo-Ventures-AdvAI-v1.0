# 📅 Configuração de Funções Agendadas (Cron Jobs)

Este documento explica como configurar as funções agendadas no Supabase para automação de tarefas críticas do AdvAI Portal.

## Pré-requisitos

1. Acesse o dashboard do Supabase: https://supabase.com/dashboard/project/vnyxjnvbdpawsrdwmsqc
2. Vá em **SQL Editor**
3. Execute os comandos SQL abaixo

## 1️⃣ Habilitar Extensões Necessárias

```sql
-- Habilitar pg_cron para agendamento de tarefas
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Habilitar pg_net para fazer requisições HTTP
CREATE EXTENSION IF NOT EXISTS pg_net;
```

## 2️⃣ Configurar Reset Mensal de Créditos (Dia 1 às 00:00)

Esta função reseta o consumo de créditos de todas as equipes no primeiro dia de cada mês.

```sql
-- Agendar reset mensal (roda todos os dias às 00:00 UTC-3)
SELECT cron.schedule(
  'monthly-credit-reset-check',
  '0 3 * * *', -- 00:00 em UTC-3 = 03:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://vnyxjnvbdpawsrdwmsqc.supabase.co/functions/v1/monthly-credit-reset',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZueXhqbnZiZHBhd3NyZHdtc3FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMzMzNzUsImV4cCI6MjA3NzYwOTM3NX0.YWRbmR2VVnzs3czoB_FJnYLtKFMkzvGrX6bv4z9A71k"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

## 3️⃣ Configurar Alerta de Créditos Baixos (A cada 15 minutos)

Esta função verifica se alguma equipe tem menos de 100 créditos e envia alertas.

```sql
-- Agendar verificação de créditos baixos (a cada 15 minutos)
SELECT cron.schedule(
  'check-low-credits-alert',
  '*/15 * * * *', -- A cada 15 minutos
  $$
  SELECT net.http_post(
    url := 'https://vnyxjnvbdpawsrdwmsqc.supabase.co/functions/v1/check-low-credits',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZueXhqbnZiZHBhd3NyZHdtc3FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMzMzNzUsImV4cCI6MjA3NzYwOTM3NX0.YWRbmR2VVnzs3czoB_FJnYLtKFMkzvGrX6bv4z9A71k"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

## 4️⃣ Verificar Cron Jobs Ativos

```sql
-- Listar todos os cron jobs configurados
SELECT * FROM cron.job;
```

## 5️⃣ Remover um Cron Job (se necessário)

```sql
-- Deletar um cron job específico pelo nome
SELECT cron.unschedule('monthly-credit-reset-check');
SELECT cron.unschedule('check-low-credits-alert');
```

## 📊 Monitoramento

### Ver logs das funções agendadas:

1. Acesse: https://supabase.com/dashboard/project/vnyxjnvbdpawsrdwmsqc/functions/monthly-credit-reset/logs
2. Acesse: https://supabase.com/dashboard/project/vnyxjnvbdpawsrdwmsqc/functions/check-low-credits/logs

### Testar manualmente as funções:

```bash
# Testar reset mensal
curl -X POST https://vnyxjnvbdpawsrdwmsqc.supabase.co/functions/v1/monthly-credit-reset \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZueXhqbnZiZHBhd3NyZHdtc3FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMzMzNzUsImV4cCI6MjA3NzYwOTM3NX0.YWRbmR2VVnzs3czoB_FJnYLtKFMkzvGrX6bv4z9A71k"

# Testar alerta de créditos baixos
curl -X POST https://vnyxjnvbdpawsrdwmsqc.supabase.co/functions/v1/check-low-credits \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZueXhqbnZiZHBhd3NyZHdtc3FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMzMzNzUsImV4cCI6MjA3NzYwOTM3NX0.YWRbmR2VVnzs3czoB_FJnYLtKFMkzvGrX6bv4z9A71k"
```

## 🎯 Comportamento Esperado

### Reset Mensal:
- ✅ Roda todos os dias às 00:00 (UTC-3)
- ✅ Verifica se é dia 1 do mês
- ✅ Se sim, reseta `creditos_utilizados` para 0 de todas as equipes
- ✅ Mantém `creditos_avulsos` intactos
- ✅ Registra no `metadata` a data do reset

### Alerta de Créditos Baixos:
- ✅ Roda a cada 15 minutos
- ✅ Verifica o saldo de todas as equipes
- ✅ Se saldo < 100 créditos → envia alerta
- ✅ Previne spam: máximo 1 alerta por dia por equipe
- ✅ Registra no `metadata` a data do último alerta

## 🔧 Troubleshooting

**Problema:** Cron jobs não estão executando
- Verifique se as extensões `pg_cron` e `pg_net` estão habilitadas
- Confirme que as URLs das funções estão corretas
- Verifique os logs das Edge Functions

**Problema:** Alertas não estão sendo enviados
- A função atual apenas loga no console
- Para enviar emails reais, integre com serviço de email (Resend, SendGrid, etc.)

## 📝 Notas Importantes

⚠️ **Segurança:** O token Bearer usado é a `ANON_KEY` pública do Supabase. As funções são públicas (`verify_jwt = false`) mas só executam lógica de sistema.

⚠️ **Timezone:** Todos os horários são configurados considerando UTC-3 (horário de Brasília).

⚠️ **Custos:** Cron jobs do Supabase são gratuitos, mas consomem recursos de Edge Functions.
