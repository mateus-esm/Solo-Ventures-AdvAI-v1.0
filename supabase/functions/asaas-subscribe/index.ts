import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ASAAS_API_URL = 'https://api.asaas.com/v3'; // Use 'https://api-sandbox.asaas.com/v3' para testes

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const asaasApiKey = Deno.env.get('ASAAS_API_KEY');
    if (!asaasApiKey) {
      throw new Error('ASAAS_API_KEY not configured');
    }

    // Authenticate user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    console.log('[Asaas Subscribe] Authenticated user:', user.id);

    // Get request body
    // creditCardToken: Token do cartão gerado pelo front-end (Asaas.js) ou salvo no banco
    const { plano_id, creditCardToken, creditCardHolderInfo } = await req.json();
    
    if (!plano_id) {
      throw new Error('plano_id is required');
    }

    // Get user's profile and team
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('equipe_id, nome_completo, email, cpf, telefone') // Adicionei telefone se tiver, Asaas pede para notificação
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('Profile not found');
    }

    // Validate CPF/CNPJ
    if (!profile.cpf) {
      throw new Error('CPF/CNPJ não cadastrado. Complete seu cadastro.');
    }

    // Get team data
    const { data: equipe, error: equipeError } = await supabaseClient
      .from('equipes')
      .select('id, nome_cliente, asaas_customer_id')
      .eq('id', profile.equipe_id)
      .single();

    if (equipeError || !equipe) {
      throw new Error('Team not found');
    }

    // Get plan details
    const { data: plano, error: planoError } = await supabaseClient
      .from('planos')
      .select('*')
      .eq('id', plano_id)
      .single();

    if (planoError || !plano) {
      throw new Error('Plan not found');
    }

    let asaasCustomerId = equipe.asaas_customer_id;

    // 1. Create/Update Customer in Asaas
    if (!asaasCustomerId) {
      console.log('[Asaas Subscribe] Creating customer in Asaas...');
      const customerRes = await fetch(`${ASAAS_API_URL}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'access_token': asaasApiKey },
        body: JSON.stringify({
          name: equipe.nome_cliente,
          email: profile.email,
          cpfCnpj: profile.cpf,
          notificationDisabled: false,
        }),
      });
      
      if (!customerRes.ok) {
        const err = await customerRes.json();
        throw new Error(`Asaas Customer Error: ${JSON.stringify(err)}`);
      }
      
      const customerData = await customerRes.json();
      asaasCustomerId = customerData.id;

      // Save customer ID
      await supabaseClient
        .from('equipes')
        .update({ asaas_customer_id: asaasCustomerId })
        .eq('id', equipe.id);
    }

    // 2. Calculate Next Due Date (Always the 1st of next month)
    const today = new Date();
    // Ano atual, Mês atual + 1 (mês que vem), dia 1
    // O construtor do JS lida com a virada de ano automaticamente (ex: mês 11 + 1 = mês 0 do próximo ano)
    const nextDue = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    
    // Formatar para YYYY-MM-DD
    const nextDueDate = nextDue.toISOString().split('T')[0];

    console.log(`[Asaas Subscribe] Next Cycle Date: ${nextDueDate}`);

    // 3. Create Subscription
    // Se tiver token, usa cartão. Se não, fallback (mas seu requisito pede cartão para recorrência automática)
    const billingType = creditCardToken ? 'CREDIT_CARD' : 'UNDEFINED'; 

    const subscriptionBody: any = {
      customer: asaasCustomerId,
      billingType: billingType,
      value: plano.preco_mensal,
      nextDueDate: nextDueDate, // Vencimento dia 01
      cycle: 'MONTHLY',
      description: `Assinatura ${plano.nome} - AdvAI Portal`,
      externalReference: `sub_${equipe.id}_${plano.id}` // Ajuda a identificar no Webhook
    };

    // Se for cartão, adiciona o token e info do titular (necessário para a primeira cobrança às vezes)
    if (creditCardToken) {
      subscriptionBody.creditCardToken = creditCardToken;
      // Para tokenização funcionar bem na primeira vez, o Asaas pode pedir o IP remoto
      // Em Edge Functions, o IP pode estar no header
      const remoteIp = req.headers.get('x-forwarded-for') || '0.0.0.0';
      subscriptionBody.remoteIp = remoteIp;
      
      if (creditCardHolderInfo) {
          subscriptionBody.creditCardHolderInfo = creditCardHolderInfo;
      }
    }

    const subRes = await fetch(`${ASAAS_API_URL}/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access_token': asaasApiKey },
      body: JSON.stringify(subscriptionBody),
    });

    if (!subRes.ok) {
        // Log detalhado do erro do Asaas
        const errObj = await subRes.json();
        console.error('[Asaas Subscribe] API Error:', JSON.stringify(errObj));
        
        // Retorna o erro específico (ex: cartão inválido)
        if (errObj.errors && errObj.errors.length > 0) {
            throw new Error(`Asaas: ${errObj.errors[0].description}`);
        }
        throw new Error('Failed to create subscription');
    }

    const subData = await subRes.json();
    console.log('[Asaas Subscribe] Success:', subData.id);

    // 4. Update local database
    await supabaseClient
      .from('equipes')
      .update({ 
        asaas_subscription_id: subData.id,
        subscription_status: 'ACTIVE',
        plano_id: plano_id,
        // Se houver dados de cartão na resposta (ex: últimos dígitos), pode salvar para exibir no front
      })
      .eq('id', equipe.id);

    return new Response(
      JSON.stringify({ 
        success: true,
        subscriptionId: subData.id,
        status: subData.status,
        invoiceUrl: subData.invoiceUrl || null, // URL caso precise de ação manual
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[Asaas Subscribe] Fatal Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
