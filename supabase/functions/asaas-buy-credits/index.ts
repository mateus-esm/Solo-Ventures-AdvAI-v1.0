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
    if (!asaasApiKey) throw new Error('ASAAS_API_KEY not configured');

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const { amount, paymentMethod, credits, creditCardToken } = await req.json();

    const { data: profile } = await supabaseAuth.from('profiles').select('equipe_id, nome_completo, email, cpf').eq('user_id', user.id).single();
    if (!profile) throw new Error('Perfil não encontrado');
    if (!profile.cpf) throw new Error('CPF obrigatório no perfil.');

    const { data: equipe } = await supabaseAuth.from('equipes').select('id, nome_cliente, asaas_customer_id').eq('id', profile.equipe_id).single();
    if (!equipe) throw new Error('Equipe não encontrada.');

    // 1. Garantir Cliente
    let asaasCustomerId = equipe.asaas_customer_id;
    if (!asaasCustomerId) {
       const newCustomerRes = await fetch(`${ASAAS_API_URL}/customers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'access_token': asaasApiKey },
          body: JSON.stringify({ name: equipe.nome_cliente, email: profile.email, cpfCnpj: profile.cpf })
       });
       const newCustomer = await newCustomerRes.json();
       if (!newCustomer.id) throw new Error(`Falha ao criar cliente: ${JSON.stringify(newCustomer.errors)}`);
       
       asaasCustomerId = newCustomer.id;
       await supabaseAdmin.from('equipes').update({ asaas_customer_id: asaasCustomerId }).eq('id', equipe.id);
    }

    // 2. Transação Pendente
    const { data: transacao, error: txError } = await supabaseAdmin
      .from('transacoes')
      .insert({
        equipe_id: equipe.id,
        tipo: 'compra_creditos',
        valor: amount,
        status: 'pendente',
        descricao: `Compra de ${credits} créditos AdvAI`,
        metadata: { creditos: credits } 
      })
      .select()
      .single();

    if (txError || !transacao) throw new Error(`Erro ao criar transação: ${txError?.message}`);

    // 3. Cobrança Asaas
    const billingType = paymentMethod === 'PIX' ? 'PIX' : 'CREDIT_CARD';
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);

    const paymentBody: any = {
      customer: asaasCustomerId,
      billingType: billingType,
      value: amount,
      dueDate: dueDate.toISOString().split('T')[0],
      description: `Recarga de ${credits} créditos AdvAI`,
      externalReference: `credits_${transacao.id}`, 
    };

    if (billingType === 'CREDIT_CARD' && creditCardToken) {
        paymentBody.creditCardToken = creditCardToken;
    }

    const paymentRes = await fetch(`${ASAAS_API_URL}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access_token': asaasApiKey },
      body: JSON.stringify(paymentBody)
    });

    const paymentData = await paymentRes.json();

    if (!paymentRes.ok) {
        await supabaseAdmin.from('transacoes').update({ status: 'falha' }).eq('id', transacao.id);
        throw new Error(paymentData.errors?.[0]?.description || 'Erro Asaas');
    }

    const response: any = {
      success: true,
      paymentId: paymentData.id,
      invoiceUrl: paymentData.invoiceUrl,
      transactionId: transacao.id
    };

    if (billingType === 'PIX') {
       const pixRes = await fetch(`${ASAAS_API_URL}/payments/${paymentData.id}/pixQrCode`, {
         headers: { 'access_token': asaasApiKey }
       });
       if (pixRes.ok) {
         const pixJson = await pixRes.json();
         response.pixQrCode = pixJson.encodedImage;
         response.pixCopyPaste = pixJson.payload;
       }
    }

    return new Response(JSON.stringify(response), { headers: corsHeaders });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
  }
});
