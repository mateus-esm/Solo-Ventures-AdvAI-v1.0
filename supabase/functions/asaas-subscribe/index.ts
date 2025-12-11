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

    const { plano_id } = await req.json();

    // 1. Buscar Dados
    const { data: profile } = await supabaseClient.from('profiles').select('equipe_id, email, cpf, nome_completo').eq('user_id', user.id).single();
    const { data: equipe } = await supabaseClient.from('equipes').select('id, nome_cliente, asaas_customer_id').eq('id', profile.equipe_id).single();
    const { data: plano } = await supabaseClient.from('planos').select('*').eq('id', plano_id).single();

    // 2. Garantir Cliente Asaas
    let customerId = equipe.asaas_customer_id;
    if (!customerId) {
        const searchRes = await fetch(`${ASAAS_API_URL}/customers?email=${profile.email}`, { headers: { 'access_token': asaasApiKey } });
        const searchData = await searchRes.json();
        
        if (searchData.data?.length > 0) {
            customerId = searchData.data[0].id;
        } else {
            const createRes = await fetch(`${ASAAS_API_URL}/customers`, {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', 'access_token': asaasApiKey },
                body: JSON.stringify({ name: equipe.nome_cliente, email: profile.email, cpfCnpj: profile.cpf })
            });
            const newCus = await createRes.json();
            if (!newCus.id) throw new Error("Erro ao criar cliente Asaas: " + JSON.stringify(newCus.errors));
            customerId = newCus.id;
        }
        await supabaseClient.from('equipes').update({ asaas_customer_id: customerId }).eq('id', equipe.id);
    }

    // 3. Criar Assinatura no Asaas
    const subBody = {
        customer: customerId,
        billingType: 'UNDEFINED',
        value: plano.preco_mensal,
        nextDueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        cycle: 'MONTHLY',
        description: `Assinatura ${plano.nome}`,
        externalReference: `sub_${equipe.id}_${plano.id}`
    };

    const subRes = await fetch(`${ASAAS_API_URL}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'access_token': asaasApiKey },
        body: JSON.stringify(subBody)
    });
    
    const subData = await subRes.json();
    if (!subData.id) throw new Error("Erro Asaas: " + JSON.stringify(subData.errors));

    // 4. BUSCAR LINK DA COBRANÇA (LOOP DE 30 SEGUNDOS)
    let invoiceUrl = null;
    let paymentId = null;
    
    console.log(`Assinatura ${subData.id} criada. Buscando cobrança...`);

    for (let i = 0; i < 30; i++) { 
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const paymentsRes = await fetch(`${ASAAS_API_URL}/subscriptions/${subData.id}/payments?limit=1`, {
            headers: { 'access_token': asaasApiKey }
        });
        const paymentsData = await paymentsRes.json();
        
        if (paymentsData.data && paymentsData.data.length > 0) {
            invoiceUrl = paymentsData.data[0].invoiceUrl;
            paymentId = paymentsData.data[0].id;
            break; 
        }
    }

    if (!invoiceUrl) throw new Error("O Asaas demorou para gerar o link. Tente novamente.");

    // 5. REGISTRAR TRANSAÇÃO NO HISTÓRICO
    await supabaseClient.from('transacoes').insert({
        equipe_id: equipe.id,
        tipo: 'assinatura',
        valor: plano.preco_mensal,
        status: 'pendente',
        descricao: `Assinatura ${plano.nome}`,
        invoice_url: invoiceUrl,
        gateway_id: paymentId
    });

    // 6. Atualizar Status da Equipe
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
