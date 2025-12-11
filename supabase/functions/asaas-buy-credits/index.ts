import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const ASAAS_API_URL = 'https://api.asaas.com/v3';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const asaasApiKey = Deno.env.get('ASAAS_API_KEY');
    if (!asaasApiKey) throw new Error('ASAAS_API_KEY não configurada');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');
    const { data: { user } } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));
    
    if (!user) throw new Error('Unauthorized');

    const { amount, credits } = await req.json();

    const { data: profile } = await supabaseClient.from('profiles').select('equipe_id, email, cpf, nome_completo').eq('user_id', user.id).single();
    const { data: equipe } = await supabaseClient.from('equipes').select('id, nome_cliente, asaas_customer_id').eq('id', profile.equipe_id).single();

    // 1. Garantir Cliente
    let asaasCustomerId = equipe.asaas_customer_id;
    if (!asaasCustomerId) {
       const searchRes = await fetch(`${ASAAS_API_URL}/customers?email=${profile.email}`, { headers: { 'access_token': asaasApiKey } });
       const searchData = await searchRes.json();
       if (searchData.data?.length > 0) {
           asaasCustomerId = searchData.data[0].id;
       } else {
           const newRes = await fetch(`${ASAAS_API_URL}/customers`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'access_token': asaasApiKey },
              body: JSON.stringify({ name: equipe.nome_cliente, email: profile.email, cpfCnpj: profile.cpf })
           });
           const newCus = await newRes.json();
           asaasCustomerId = newCus.id;
       }
       await supabaseClient.from('equipes').update({ asaas_customer_id: asaasCustomerId }).eq('id', equipe.id);
    }

    // 2. Transação
    const { data: transacao } = await supabaseClient.from('transacoes').insert({
        equipe_id: equipe.id,
        tipo: 'compra_creditos',
        valor: amount,
        status: 'pendente',
        descricao: `Compra de ${credits} créditos`,
        metadata: { creditos: credits }
      }).select().single();

    // 3. Cobrança
    const paymentBody = {
      customer: asaasCustomerId,
      billingType: 'UNDEFINED',
      value: amount,
      dueDate: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
      description: `Recarga de ${credits} créditos AdvAI`,
      externalReference: `credits_${transacao.id}`
    };

    const paymentRes = await fetch(`${ASAAS_API_URL}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access_token': asaasApiKey },
      body: JSON.stringify(paymentBody)
    });

    const paymentData = await paymentRes.json();
    
    if (!paymentData.invoiceUrl) {
        throw new Error("Erro Asaas: Link não gerado. " + JSON.stringify(paymentData.errors));
    }

    await supabaseClient.from('transacoes').update({ invoice_url: paymentData.invoiceUrl }).eq('id', transacao.id);

    return new Response(JSON.stringify({ 
        success: true, 
        invoiceUrl: paymentData.invoiceUrl 
    }), { headers: corsHeaders });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
  }
});
