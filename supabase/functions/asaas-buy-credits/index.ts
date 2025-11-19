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

    console.log('[Asaas Buy Credits] Authenticated user:', user.id);

    // Get request body
    const { amount, paymentMethod, credits } = await req.json();
    if (!amount || !paymentMethod || !credits) {
      throw new Error('amount, paymentMethod and credits are required');
    }

    console.log('[Asaas Buy Credits] Request:', { amount, paymentMethod, credits });

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
      throw new Error('CPF não cadastrado. Por favor, complete seu cadastro antes de realizar a compra.');
    }

    // Get team data
    const { data: equipe, error: equipeError } = await supabaseClient
      .from('equipes')
      .select('id, nome_cliente, asaas_customer_id, creditos_avulsos')
      .eq('id', profile.equipe_id)
      .single();

    if (equipeError || !equipe) {
      throw new Error('Team not found');
    }

    let asaasCustomerId = equipe.asaas_customer_id;

    // Create customer in Asaas if not exists
    if (!asaasCustomerId) {
      console.log('[Asaas Buy Credits] Creating customer in Asaas...');
      
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
        console.error('[Asaas Buy Credits] Error creating customer:', errorData);
        throw new Error(`Failed to create customer: ${errorData}`);
      }

      const customerData = await customerResponse.json();
      asaasCustomerId = customerData.id;

      console.log('[Asaas Buy Credits] Customer created:', asaasCustomerId);

      // Update team with customer ID
      const { error: updateError } = await supabaseClient
        .from('equipes')
        .update({ asaas_customer_id: asaasCustomerId })
        .eq('id', equipe.id);

      if (updateError) {
        console.error('[Asaas Buy Credits] Error updating team:', updateError);
      }
    } else {
      // Customer already exists, update CPF if needed
      console.log('[Asaas Buy Credits] Updating existing customer CPF...');
      
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
        console.error('[Asaas Buy Credits] Error updating customer CPF:', errorData);
      } else {
        console.log('[Asaas Buy Credits] Customer CPF updated successfully');
      }
    }

    // Create payment in Asaas
    console.log('[Asaas Buy Credits] Creating payment...');
    
    const billingType = paymentMethod === 'PIX' ? 'PIX' : 'CREDIT_CARD';
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1); // Tomorrow

    const paymentResponse = await fetch(`${ASAAS_API_URL}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': asaasApiKey,
      },
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType: billingType,
        value: amount,
        dueDate: dueDate.toISOString().split('T')[0],
        description: `Recarga de ${credits} créditos AdvAI`,
        externalReference: `credits_${equipe.id}_${Date.now()}`,
      }),
    });

    if (!paymentResponse.ok) {
      const errorData = await paymentResponse.text();
      console.error('[Asaas Buy Credits] Error creating payment:', errorData);
      throw new Error(`Failed to create payment: ${errorData}`);
    }

    const paymentData = await paymentResponse.json();
    console.log('[Asaas Buy Credits] Payment created:', paymentData.id);

    const response: any = {
      success: true,
      paymentId: paymentData.id,
      invoiceUrl: paymentData.invoiceUrl,
    };

    // If PIX, get QR Code
    if (paymentMethod === 'PIX' && paymentData.id) {
      console.log('[Asaas Buy Credits] Fetching PIX QR Code...');
      
      const pixResponse = await fetch(`${ASAAS_API_URL}/payments/${paymentData.id}/pixQrCode`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'access_token': asaasApiKey,
        },
      });

      if (pixResponse.ok) {
        const pixData = await pixResponse.json();
        response.pixQrCode = pixData.encodedImage; // Base64 image
        response.pixCopyPaste = pixData.payload; // Copy & Paste code
        console.log('[Asaas Buy Credits] PIX QR Code retrieved successfully');
      } else {
        console.error('[Asaas Buy Credits] Error fetching PIX QR Code');
      }
    }

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[Asaas Buy Credits] Fatal Error:', error);
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
