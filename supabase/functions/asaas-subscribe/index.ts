import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASAAS_API_URL = 'https://api.asaas.com/v3';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const asaasApiKey = Deno.env.get('ASAAS_API_KEY');
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');
    const { data: { user } } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) throw new Error('Unauthorized');

    const { plano_id } = await req.json();

    const { data: profile } = await supabaseClient.from('profiles').select('equipe_id, email, cpf, nome_completo').eq('user_id', user.id).single();
    const { data: equipe } = await supabaseClient.from('equipes').select('id, nome_cliente, asaas_customer_id').eq('id', profile.equipe_id).single();
    const { data: plano } = await supabaseClient.from('planos').select('*').eq('id', plano_id).single();

    // 1. Garantir Cliente
    let customerId = equipe.asaas_customer_id;
    if (!customerId) {
        const searchRes = await fetch(`${ASAAS_API_URL}/customers?email=${profile.email}`, { headers: { 'access_token': asaasApiKey! } });
        const searchData = await searchRes.json();
        if (searchData.data?.length > 0) {
            customerId = searchData.data[0].id;
        } else {
            const createRes = await fetch(`${ASAAS_API_URL}/customers`, {
                method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'access_token': asaasApiKey! },
        body: JSON.stringify({ name: equipe.nome_cliente, email: profile.email, cpfCnpj: profile.cpf })
            });
            const newCus = await createRes.json();
            customerId = newCus.id;
        }
        await supabaseClient.from('equipes').update({ asaas_customer_id: customerId }).eq('id', equipe.id);
    }

    // 2. Criar Assinatura (UNDEFINED = Cliente escolhe método na tela do Asaas)
    const subBody = {
        customer: customerId,
        billingType: 'UNDEFINED', 
        value: plano.preco_mensal,
        nextDueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Vence Amanhã
        cycle: 'MONTHLY',
        description: `Assinatura ${plano.nome}`,
        externalReference: `sub_${equipe.id}_${plano.id}`
    };

    const subRes = await fetch(`${ASAAS_API_URL}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'access_token': asaasApiKey! },
        body: JSON.stringify(subBody)
    });
    const subData = await subRes.json();
    if (!subData.id) throw new Error(JSON.stringify(subData));

    // 3. Buscar a Primeira Cobrança com RETRY (Correção do Erro)
    let invoiceUrl = null;
    
    // Tenta 5 vezes, esperando 1s entre cada tentativa
    for (let i = 0; i < 5; i++) {
        // Delay de 1 segundo
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const paymentsRes = await fetch(`${ASAAS_API_URL}/subscriptions/${subData.id}/payments?limit=1`, {
            headers: { 'access_token': asaasApiKey! }
        });
        const paymentsData = await paymentsRes.json();
        
        if (paymentsData.data && paymentsData.data.length > 0) {
            invoiceUrl = paymentsData.data[0].invoiceUrl;
            break; // Achou! Sai do loop
        }
        console.log(`Tentativa ${i+1}: Cobrança ainda não gerada...`);
    }

    if (!invoiceUrl) {
        // Fallback: Se não gerou link, mandamos para a lista de assinaturas (menos ideal, mas não trava)
        // Mas geralmente em 5s o Asaas gera.
        throw new Error("O Asaas está processando sua assinatura. Verifique seu email em instantes para o link de pagamento.");
    }

    // Atualiza equipe
    await supabaseClient.from('equipes').update({ 
        asaas_subscription_id: subData.id,
        subscription_status: 'pending_payment',
        plano_id: plano_id 
    }).eq('id', equipe.id);

    return new Response(JSON.stringify({ 
        success: true, 
        invoiceUrl: invoiceUrl 
    }), { headers: corsHeaders });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
  }
});
