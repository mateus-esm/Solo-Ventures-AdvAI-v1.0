import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ATENÇÃO: Idealmente mova este token para o .env do Supabase (Vault)
const GPT_MAKER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJncHRtYWtlciIsImlkIjoiM0RGMEI1MTg1QkI0ODEzNEQ4RUM0MkNFQThEMEE4OTkiLCJ0ZW5hbnQiOiIzREYwQjUxODVCQjQ4MTM0RDhFQzQyQ0VBOEQwQTg5OSIsInV1aWQiOiI3N2MyMGVlMi1jZTZjLTRmMjgtODM0Yy05NDhkZjFkMTU0YzAifQ.K4o7dfvhCp0wZ25ILxTteKY5CdI3tIw_S_Uyj3dZfTE";

serve(async (req) => {
  // Tratamento de CORS
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    console.log('[Monthly Process] Iniciando rotina mensal (Dia 01)...');

    // 1. Verificação de Data (Dia 01)
    const now = new Date();
    const saoPauloTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const dayOfMonth = saoPauloTime.getDate();

    // Se não for dia 1, encerra (a menos que você esteja testando manualmente e remova esse IF)
    if (dayOfMonth !== 1) {
      console.log('[Monthly Process] Hoje não é dia 01. Rotina abortada.');
      return new Response(JSON.stringify({ message: 'Hoje não é dia de virada.', day: dayOfMonth }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 2. Buscar todas as equipes e dados relevantes
    const { data: equipes, error } = await supabase
      .from('equipes')
      .select('id, nome_cliente, subscription_status, gpt_agent_id, asaas_subscription_id, valor_base_plano');

    if (error) throw error;

    const periodo = `${saoPauloTime.getFullYear()}-${(saoPauloTime.getMonth() + 1).toString().padStart(2, '0')}`;
    let processedCount = 0;

    console.log(`[Monthly Process] Encontradas ${equipes?.length || 0} equipes.`);

    for (const equipe of equipes || []) {
      console.log(`\n--- Processando: ${equipe.nome_cliente} ---`);

      // ---------------------------------------------------------
      // PASSO A: RESETAR CRÉDITOS (INCONDICIONAL)
      // ---------------------------------------------------------
      // Zera o consumo independente do status de pagamento (pending, overdue, active)
      const { error: resetError } = await supabase.from('consumo_creditos').upsert({
        equipe_id: equipe.id,
        periodo: periodo,
        creditos_utilizados: 0,
        data_consumo: new Date().toISOString(),
        metadata: { 
            reset_type: 'monthly_automatic', 
            note: 'Virada de Mês Automática' 
        }
      }, { onConflict: 'equipe_id,periodo' });

      if (resetError) {
          console.error(`Erro ao resetar créditos: ${resetError.message}`);
      } else {
          console.log(`✅ Créditos zerados para o período ${periodo}`);
      }

      // ---------------------------------------------------------
      // PASSO B: VERIFICAR WHATSAPP E ATUALIZAR COBRANÇA
      // ---------------------------------------------------------
      let valorFinal = Number(equipe.valor_base_plano) || 0;
      // Se valor base for 0 ou nulo, assume um valor default ou alerta (aqui assumindo 0 pra não quebrar)
      
      let temWhatsapp = false;
      let descricaoFatura = "Assinatura AdvAI";

      // Só verifica GPT se tivermos o ID do agente
      if (equipe.gpt_agent_id) {
        try {
          console.log(`Verificando canais no GPT Maker (Agent: ${equipe.gpt_agent_id})...`);
          
          const url = `https://api.gptmaker.ai/v2/agent/${equipe.gpt_agent_id}/search`;
          const gptRes = await fetch(url, {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${GPT_MAKER_TOKEN}`,
                'Content-Type': 'application/json'
            }
          });
          
          if (gptRes.ok) {
            const json = await gptRes.json();
            const channels = json.data || []; // Array de canais
            
            // Lógica: Procura canal WHATSAPP que esteja CONNECTED
            const activeWpp = channels.find((ch: any) => 
                ch.type === 'WHATSAPP' && ch.connected === true
            );

            if (activeWpp) {
              console.log(`🔥 WhatsApp Conectado detectado! (+ R$100,00)`);
              temWhatsapp = true;
              valorFinal += 100;
              descricaoFatura = "Assinatura AdvAI + Conexão WhatsApp Oficial";
            } else {
              console.log(`Nenhum WhatsApp ativo encontrado.`);
            }
          } else {
             console.error(`Erro API GPT Maker: ${gptRes.status}`);
          }
        } catch (err) {
          console.error(`Falha na verificação do GPT Maker:`, err);
        }
      }

      // ---------------------------------------------------------
      // PASSO C: ATUALIZAR ASSINATURA NO ASAAS
      // ---------------------------------------------------------
      // Isso garante que a cobrança gerada no histórico tenha o valor correto
      if (equipe.asaas_subscription_id) {
        try {
          console.log(`Atualizando Assinatura Asaas (${equipe.asaas_subscription_id}) para R$ ${valorFinal.toFixed(2)}...`);
          
          const asaasRes = await fetch(`https://www.asaas.com/api/v3/subscriptions/${equipe.asaas_subscription_id}`, {
            method: 'POST', // POST em subscriptions/{id} atualiza os dados
            headers: {
              'access_token': Deno.env.get('ASAAS_API_KEY') ?? '',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              value: valorFinal,
              description: descricaoFatura,
              updatePendingPayments: true // Importante: Tenta atualizar boletos pendentes ainda não pagos deste ciclo
            })
          });

          if (asaasRes.ok) {
              console.log(`✅ Assinatura atualizada com sucesso no Asaas.`);
          } else {
              const errTxt = await asaasRes.text();
              console.error(`Erro Asaas: ${asaasRes.status} - ${errTxt}`);
          }
        } catch (err) {
          console.error(`Erro de conexão com Asaas:`, err);
        }
      } else {
          console.log(`Ignorando atualização Asaas: ID de assinatura não encontrado.`);
      }
      
      processedCount++;
    }

    return new Response(
      JSON.stringify({ 
          success: true, 
          message: 'Processamento mensal concluído', 
          processed: processedCount 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error("Erro Fatal na Edge Function:", error);
    return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
  }
});
