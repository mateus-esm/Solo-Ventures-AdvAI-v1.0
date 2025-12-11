import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASAAS_API_URL = 'https://api.asaas.com/v3';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const asaasApiKey = Deno.env.get('ASAAS_API_KEY');
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Token não fornecido');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) throw new Error('Sessão inválida');

    const { plano_id } = await req.json();

    // 2. Buscar Dados
    const { data: profile } = await supabaseClient.from('profiles').select('equipe_id, email, cpf, nome_completo').eq('user_id', user.id).single();
    const { data: equipe } = await supabaseClient.from('equipes').select('id, nome_cliente, asaas_customer_id').eq('id', profile.equipe_id).single();
    const { data: plano } = await supabaseClient.from('planos').select('*').eq('id', plano_id).single();

    // 3. Garantir Cliente no Asaas
    let customerId = equipe.asaas_customer_id;
    if (!customerId) {
        // Busca preventiva
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

    // 4. Criar Assinatura
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
    if (!subData.id) throw new Error("Erro ao criar assinatura: " + JSON.stringify(subData.errors));

    // 5. LOOP DE PERSISTÊNCIA (30 Segundos)
    // Aqui está a correção: insistimos até o link aparecer.
    let invoiceUrl = null;
    
    console.log(`Assinatura ${subData.id} criada. Aguardando cobrança...`);

    for (let i = 0; i < 30; i++) { // 30 tentativas
        await new Promise(resolve => setTimeout(resolve, 1000)); // Espera 1s
        
        const paymentsRes = await fetch(`${ASAAS_API_URL}/subscriptions/${subData.id}/payments?limit=1`, {
            headers: { 'access_token': asaasApiKey }
        });
        const paymentsData = await paymentsRes.json();
        
        if (paymentsData.data && paymentsData.data.length > 0) {
            invoiceUrl = paymentsData.data[0].invoiceUrl;
            console.log(`Link encontrado na tentativa ${i+1}: ${invoiceUrl}`);
            break; 
        }
    }

    if (!invoiceUrl) {
        throw new Error("Timeout: O Asaas não gerou a cobrança a tempo. Verifique seu email.");
    }

    // 6. Atualizar Banco
    await supabaseClient.from('equipes').update({ 
        asaas_subscription_id: subData.id,
        subscription_status: 'pending_payment',
        plano_id: plano_id 
    }).eq('id', equipe.id);

    return new Response(JSON.stringify({ success: true, invoiceUrl }), { headers: corsHeaders });

  } catch (error: any) {
    console.error("Erro Fatal Subscribe:", error);
    return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
  }
});
