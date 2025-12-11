import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// URL do Webhook do Jestor (Pode vir de uma variável de ambiente para ser dinâmico por cliente)
const JESTOR_WEBHOOK_URL = "https://mateussmaia.api.jestor.com/webhook/NzBmYTlhZDM5N2EwMzU5b85607b808MTc2NTQyMDk4MThhMmI3"; 

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { event, payment } = body;

    console.log(`[Webhook Asaas] Evento: ${event} | ID: ${payment.id}`);

    // ==================================================================
    // 1. INTEGRAÇÃO JESTOR (O "Tradutor")
    // ==================================================================
    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
        try {
            // Montamos um JSON plano e simples, à prova de falhas
            const payloadJestor = {
                id_pagamento: payment.id,
                valor: payment.value,
                valor_liquido: payment.netValue,
                cliente_id: payment.customer,
                forma_pagamento: payment.billingType,
                status: event, 
                data_pagamento: payment.paymentDate || new Date().toISOString().split('T')[0],
                descricao: payment.description,
                link_fatura: payment.invoiceUrl,
                referencia_externa: payment.externalReference
            };

            console.log("Enviando para Jestor...", JSON.stringify(payloadJestor));

            // Dispara para o Jestor sem esperar a resposta bloquear o resto (Fire and Forget)
            fetch(JESTOR_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadJestor)
            }).then(async res => {
                if (!res.ok) console.error(`[Erro Jestor] ${res.status}: ${await res.text()}`);
                else console.log("[Sucesso Jestor] Dados enviados.");
            }).catch(err => console.error("[Erro Jestor] Falha na requisição:", err));

        } catch (err) {
            console.error("[Erro Jestor] Falha ao montar payload:", err);
        }
    }

    // ==================================================================
    // 2. LÓGICA INTERNA (Créditos e Assinatura)
    // ==================================================================
    if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
      const externalRef = payment.externalReference || '';
      
      // Cenário: Compra de Créditos Avulsos
      if (externalRef.startsWith('credits_')) {
          const transacaoId = externalRef.split('credits_')[1];
          const { data: transacao } = await supabaseClient.from('transacoes').select('*').eq('id', transacaoId).single();

          if (transacao && transacao.status !== 'pago') {
              const qtd = transacao.metadata?.creditos || 0;
              // Libera saldo na equipe
              if (qtd > 0) {
                  const { data: equipe } = await supabaseClient.from('equipes').select('creditos_avulsos').eq('id', transacao.equipe_id).single();
                  await supabaseClient.from('equipes').update({ creditos_avulsos: (equipe?.creditos_avulsos || 0) + qtd }).eq('id', transacao.equipe_id);
              }
              // Atualiza transação
              await supabaseClient.from('transacoes').update({
                  status: 'pago', 
                  gateway_id: payment.id, 
                  data_pagamento: new Date().toISOString(), 
                  forma_pagamento: payment.billingType, 
                  invoice_url: payment.invoiceUrl
              }).eq('id', transacaoId);
          }
      } 
      // Cenário: Assinatura
      else if (payment.subscription) {
          const { data: equipe } = await supabaseClient.from('equipes').select('id, plano_id').eq('asaas_customer_id', payment.customer).single();
          if (equipe) {
              const nextDue = new Date(); nextDue.setMonth(nextDue.getMonth() + 1); nextDue.setDate(1); 
              
              // Parsear plano_id do externalReference (formato: sub_equipeId_planoId)
              let planoIdFromRef = equipe.plano_id;
              if (externalRef && externalRef.startsWith('sub_')) {
                  const parts = externalRef.split('_');
                  if (parts.length >= 3) {
                      planoIdFromRef = parseInt(parts[2]);
                  }
              }
              
              // Buscar limite de créditos do plano
              let limiteCreditos = 1000; // default
              if (planoIdFromRef) {
                  const { data: plano } = await supabaseClient.from('planos').select('limite_creditos').eq('id', planoIdFromRef).single();
                  if (plano) {
                      limiteCreditos = plano.limite_creditos;
                  }
              }
              
              console.log(`[Webhook] Atualizando equipe ${equipe.id}: plano_id=${planoIdFromRef}, limite_creditos=${limiteCreditos}`);
              
              await supabaseClient.from('equipes').update({ 
                  subscription_status: 'active', 
                  next_due_date: nextDue.toISOString().split('T')[0],
                  plano_id: planoIdFromRef,
                  limite_creditos: limiteCreditos
              }).eq('id', equipe.id);

              await supabaseClient.from('transacoes').insert({
                  equipe_id: equipe.id, 
                  tipo: 'assinatura', 
                  valor: payment.value, 
                  status: 'pago', 
                  forma_pagamento: payment.billingType, 
                  gateway_id: payment.id, 
                  invoice_url: payment.invoiceUrl, 
                  data_pagamento: new Date().toISOString(), 
                  descricao: payment.description || 'Renovação Assinatura'
              });
          }
      }
    } 
    // Cenário: Atraso de Pagamento
    else if (event === 'PAYMENT_OVERDUE' && payment.subscription) {
         const { data: equipe } = await supabaseClient.from('equipes').select('id').eq('asaas_customer_id', payment.customer).single();
         if (equipe) {
             await supabaseClient.from('equipes').update({ subscription_status: 'pending_payment' }).eq('id', equipe.id);
         }
    }

    return new Response(JSON.stringify({ received: true }), { headers: corsHeaders, status: 200 });
  } catch (error: any) {
    console.error(`[Webhook Fatal Error] ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
  }
});
