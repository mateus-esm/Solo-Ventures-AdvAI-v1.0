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
    if (!asaasApiKey) {
      throw new Error('ASAAS_API_KEY not configured');
    }

    // Cliente Supabase com permissão de Service Role para atualizar equipe se necessário (criar customer)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verificar usuário autenticado
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) throw new Error('Unauthorized');

    // Pegar dados do corpo da requisição
    const { amount, paymentMethod, credits, creditCardToken } = await req.json();

    if (!amount || !paymentMethod || !credits) {
      throw new Error('Dados incompletos: amount, paymentMethod e credits são obrigatórios');
    }

    // Buscar perfil e equipe
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('equipe_id, nome_completo, email, cpf')
      .eq('user_id', user.id)
      .single();

    if (!profile?.cpf) throw new Error('CPF obrigatório no perfil para emitir cobrança.');

    const { data: equipe } = await supabaseClient
      .from('equipes')
      .select('id, nome_cliente, asaas_customer_id')
      .eq('id', profile.equipe_id)
      .single();

    if (!equipe) throw new Error('Equipe não encontrada.');

    // 1. Garantir Cliente no Asaas
    let asaasCustomerId = equipe.asaas_customer_id;
    
    if (!asaasCustomerId) {
      console.log('[Asaas Buy] Criando cliente no Asaas...');
      const customerRes = await fetch(`${ASAAS_API_URL}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'access_token': asaasApiKey },
        body: JSON.stringify({
          name: equipe.nome_cliente,
          email: profile.email,
          cpfCnpj: profile.cpf,
          externalReference: equipe.id
        })
      });

      const newCustomer = await customerRes.json();
      
      if (!newCustomer.id) {
         console.error('Erro Asaas Customer:', newCustomer);
         throw new Error('Falha ao criar cliente no Asaas: ' + JSON.stringify(newCustomer.errors));
      }

      asaasCustomerId = newCustomer.id;
      
      // Salva o ID do cliente na tabela equipes
      await supabaseClient
        .from('equipes')
        .update({ asaas_customer_id: asaasCustomerId })
        .eq('id', equipe.id);
    }

    // 2. Criar Cobrança no Asaas
    console.log(`[Asaas Buy] Criando cobrança de ${credits} créditos...`);
    
    const billingType = paymentMethod === 'PIX' ? 'PIX' : 'CREDIT_CARD';
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1); // Vence amanhã para dar tempo de pagar

    const paymentBody: any = {
      customer: asaasCustomerId,
      billingType: billingType,
      value: amount,
      dueDate: dueDate.toISOString().split('T')[0],
      description: `Compra de ${credits} créditos AdvAI`,
      // AQUI ESTÁ O VÍNCULO: Passamos "cred_" + a quantidade. 
      // O Webhook vai ler isso para adicionar os créditos corretos.
      externalReference: `cred_${credits}` 
    };

    // Se for cartão e veio o token, adiciona
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
      console.error('Erro Pagamento Asaas:', paymentData);
      throw new Error(paymentData.errors?.[0]?.description || 'Erro ao criar pagamento no Asaas');
    }

    // Preparar resposta
    const response: any = {
      success: true,
      paymentId: paymentData.id,
      invoiceUrl: paymentData.invoiceUrl
    };

    // Se for PIX, buscar o QR Code
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
    console.error('[Asaas Buy Error]', error);
    return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
  }
});
