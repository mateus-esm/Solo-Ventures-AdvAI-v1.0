import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Usa Service Role para atualizar tabelas protegidas e creditar saldo
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { event, payment } = body;

    console.log(`[Webhook] Evento: ${event} | Payment ID: ${payment.id} | Ref: ${payment.externalReference}`);

    // Processar apenas pagamentos confirmados/recebidos
    if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
      
      const externalRef = payment.externalReference || '';
      
      // --- CENÁRIO A: CRÉDITOS AVULSOS (Ref começa com "credits_") ---
      if (externalRef.startsWith('credits_')) {
          // Extrai o ID da transação criada no buy-credits
          const transacaoId = externalRef.split('credits_')[1];
          
          // 1. Busca a transação para saber quantos créditos liberar
          const { data: transacao, error: txError } = await supabaseClient
            .from('transacoes')
            .select('equipe_id, metadata, status')
            .eq('id', transacaoId)
            .single();

          if (txError || !transacao) {
             console.error('Transação não encontrada:', transacaoId);
             // Retorna 200 para o Asaas parar de tentar (erro nosso de lógica)
             return new Response(JSON.stringify({ error: 'Transaction not found' }), { status: 200 });
          }

          if (transacao.status === 'pago') {
             return new Response(JSON.stringify({ received: true, message: 'Already processed' }));
          }

          // 2. Libera os créditos na equipe
          const qtdCreditos = transacao.metadata?.creditos || 0;
          if (qtdCreditos > 0) {
              const { data: equipe } = await supabaseClient
                  .from('equipes')
                  .select('creditos_avulsos')
                  .eq('id', transacao.equipe_id)
                  .single();
                  
              const novoSaldo = (equipe?.creditos_avulsos || 0) + qtdCreditos;
              
              await supabaseClient
                  .from('equipes')
                  .update({ creditos_avulsos: novoSaldo })
                  .eq('id', transacao.equipe_id);
                  
              console.log(`[Webhook] +${qtdCreditos} créditos para equipe ${transacao.equipe_id}`);
          }

          // 3. Atualiza transação como PAGO e salva dados do Asaas
          await supabaseClient
            .from('transacoes')
            .update({
                status: 'pago',
                gateway_id: payment.id,
                data_pagamento: new Date().toISOString(),
                forma_pagamento: payment.billingType,
                invoice_url: payment.invoiceUrl
            })
            .eq('id', transacaoId);
      } 
      
      // --- CENÁRIO B: ASSINATURA (Tem campo subscription) ---
      else if (payment.subscription) {
          const { data: equipe } = await supabaseClient
              .from('equipes')
              .select('id')
              .eq('asaas_customer_id', payment.customer)
              .single();
              
          if (equipe) {
              // Renova status e data de vencimento
              const nextDue = new Date();
              nextDue.setMonth(nextDue.getMonth() + 1);
              nextDue.setDate(1); 

              await supabaseClient.from('equipes').update({ 
                  subscription_status: 'active',
                  next_due_date: nextDue.toISOString().split('T')[0]
              }).eq('id', equipe.id);

              // Cria registro histórico
              await supabaseClient.from('transacoes').insert({
                  equipe_id: equipe.id,
                  tipo: 'assinatura',
                  valor: payment.value,
                  status: 'pago',
                  forma_pagamento: payment.billingType,
                  gateway_id: payment.id,
                  invoice_url: payment.invoiceUrl,
                  data_pagamento: new Date().toISOString(),
                  descricao: payment.description || 'Renovação de Assinatura'
              });
          }
      }
    } 
    // --- CENÁRIO C: PAGAMENTO ATRASADO ---
    else if (event === 'PAYMENT_OVERDUE') {
        if (payment.subscription) {
             const { data: equipe } = await supabaseClient
              .from('equipes')
              .select('id')
              .eq('asaas_customer_id', payment.customer)
              .single();
              
             if (equipe) {
                 await supabaseClient.from('equipes').update({ subscription_status: 'pending_payment' }).eq('id', equipe.id);
             }
        }
    }

    return new Response(JSON.stringify({ received: true }), { headers: corsHeaders, status: 200 });
  } catch (error: any) {
    console.error(`[Webhook Error] ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
  }
});
