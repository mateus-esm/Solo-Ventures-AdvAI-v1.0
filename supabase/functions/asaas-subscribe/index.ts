import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASAAS_API_URL = 'https://api.asaas.com/v3';

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
    // Ajuste: extraindo também o creditCardToken caso venha do front
    const { plano_id, creditCardToken } = await req.json();
    if (!plano_id) {
      throw new Error('plano_id is required');
    }

    console.log('[Asaas Subscribe] Requesting subscription for plan:', plano_id);

    // Get user's profile and team
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('equipe_id, nome_completo, email, cpf')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('Profile not found');
    }

    // Validate CPF is present
    if (!profile.cpf) {
      throw new Error('CPF não cadastrado. Por favor, complete seu cadastro antes de realizar a assinatura.');
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

    console.log('[Asaas Subscribe] Plan details:', plano.nome, plano.preco_mensal);

    let asaasCustomerId = equipe.asaas_customer_id;

    // Create customer in Asaas if not exists
    if (!asaasCustomerId) {
      console.log('[Asaas Subscribe] Creating customer in Asaas...');
      
      const customerResponse = await fetch(`${ASAAS_API_URL}/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': asaasApiKey,
        },
        body: JSON.stringify({
          name: equipe.nome_cliente,
          email: profile.email,
          cpfCnpj: profile.cpf,
          notificationDisabled: false,
        }),
      });

      if (!customerResponse.ok) {
        const errorData = await customerResponse.text();
        console.error('[Asaas Subscribe] Error creating customer:', errorData);
        throw new Error(`Failed to create customer: ${errorData}`);
      }

      const customerData = await customerResponse.json();
      asaasCustomerId = customerData.id;

      console.log('[Asaas Subscribe] Customer created:', asaasCustomerId);

      // Update team with customer ID
      const { error: updateError } = await supabaseClient
        .from('equipes')
        .update({ asaas_customer_id: asaasCustomerId })
        .eq('id', equipe.id);

      if (updateError) {
        console.error('[Asaas Subscribe] Error updating team:', updateError);
      }
    } else {
      // Customer already exists, update CPF if needed
      console.log('[Asaas Subscribe] Updating existing customer CPF...');
      
      const updateCustomerResponse = await fetch(`${ASAAS_API_URL}/customers/${asaasCustomerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'access_token': asaasApiKey,
        },
        body: JSON.stringify({
          cpfCnpj: profile.cpf,
        }),
      });

      if (!updateCustomerResponse.ok) {
        const errorData = await updateCustomerResponse.text();
        console.error('[Asaas Subscribe] Error updating customer CPF:', errorData);
      } else {
        console.log('[Asaas Subscribe] Customer CPF updated successfully');
      }
    }

    // --- INÍCIO DO AJUSTE SOLICITADO ---

    // Lógica para calcular o próximo dia 01
    const today = new Date();
    // Cria data para o dia 1 do próximo mês (mês atual + 1)
    const nextDue = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    
    // Formatar para YYYY-MM-DD
    const nextDueDate = nextDue.toISOString().split('T')[0];

    // Create subscription in Asaas
    console.log('[Asaas Subscribe] Creating subscription...');
    
    const subscriptionResponse = await fetch(`${ASAAS_API_URL}/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': asaasApiKey,
      },
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType: 'CREDIT_CARD', // Força pagamento via cartão
        value: plano.preco_mensal,
        nextDueDate: nextDueDate, // Força vencimento no dia 01
        cycle: 'MONTHLY',
        description: `Assinatura ${plano.nome} - AdvAI Portal (Ciclo Mensal)`,
        creditCardToken: creditCardToken // Usa o token extraído do body da requisição
      }),
    });

    // --- FIM DO AJUSTE SOLICITADO ---

    if (!subscriptionResponse.ok) {
      const errorData = await subscriptionResponse.text();
      console.error('[Asaas Subscribe] Error creating subscription:', errorData);
      throw new Error(`Failed to create subscription: ${errorData}`);
    }

    const subscriptionData = await subscriptionResponse.json();
    console.log('[Asaas Subscribe] Subscription created:', subscriptionData.id);

    // Update team with subscription ID
    const { error: updateSubError } = await supabaseClient
      .from('equipes')
      .update({ 
        asaas_subscription_id: subscriptionData.id,
        subscription_status: 'ACTIVE',
        plano_id: plano_id,
      })
      .eq('id', equipe.id);

    if (updateSubError) {
      console.error('[Asaas Subscribe] Error updating subscription:', updateSubError);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        subscriptionId: subscriptionData.id,
        invoiceUrl: subscriptionData.invoiceUrl, // URL para o usuário digitar o cartão se não enviou token
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[Asaas Subscribe] Fatal Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
