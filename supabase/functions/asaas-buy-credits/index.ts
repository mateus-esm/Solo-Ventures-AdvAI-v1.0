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
    
    // 1. Clientes Supabase
    // Auth: Para identificar quem está pedindo (segurança)
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Admin: Para criar a transação e atualizar cliente (bypass RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 2. Validação do Usuário
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const { amount, paymentMethod, credits, creditCardToken } = await req.json();

    // 3. Buscar Dados do Perfil e Equipe
    const { data: profile } = await supabaseAuth.from('profiles').select('equipe_id, nome_completo, email, cpf').eq('user_id', user.id).single();
    if (!profile?.cpf) throw new Error('CPF obrigatório no perfil para emitir cobrança.');

    const { data: equipe } = await supabaseAuth.from('equipes').select('id, nome_cliente, asaas_customer_id').eq('id', profile.equipe_id).single();

    // 4. Garantir Cliente no Asaas
    let asaasCustomerId = equipe.asaas_customer_id;
    if (!asaasCustomerId) {
       console.log('[Asaas Buy] Criando cliente no Asaas...');
       const newCustomerRes = await fetch(`${ASAAS_API_URL}/customers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'access_token': asaasApiKey },
          body: JSON.stringify({ name: equipe.nome_cliente, email: profile.email, cpfCnpj: profile.cpf })
       });
       const newCustomer = await newCustomerRes.json();
       
       if (newCustomer.id) {
           asaasCustomerId = newCustomer.id;
           await supabaseAdmin.from('equipes').update({ asaas_customer_id: asaasCustomerId }).eq('id', equipe.id);
       } else {
           throw new Error(`Erro ao criar cliente Asaas: ${JSON.stringify(newCustomer.errors)}`);
       }
    }

    // 5. CRIAR TRANSAÇÃO PENDENTE (CRÍTICO)
    // Aqui salvamos o "pedido" antes de cobrar. O metadata guarda quantos créditos liberar.
    console.log('[Asaas Buy] Registrando transação pendente...');
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

    if (txError) throw new Error(`Erro no banco de dados: ${txError.message}`);

    // 6. CRIAR COBRANÇA NO ASAAS
    const billingType = paymentMethod === 'PIX' ? 'PIX' : 'CREDIT_CARD';
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1); // Vence amanhã

    const paymentBody: any = {
      customer: asaasCustomerId,
      billingType: billingType,
      value: amount,
      dueDate: dueDate.toISOString().split('T')[0],
      description: `Recarga de ${credits} créditos AdvAI`,
      // O VÍNCULO MÁGICO: Enviamos o ID da transação no externalReference
      // Quando o webhook receber o pagamento, ele lerá "credits_ID" e saberá qual transação atualizar
      externalReference: `credits_${transacao.id}`, 
    };

    if (billingType === 'CREDIT_CARD' && creditCardToken) {
        paymentBody.creditCardToken = creditCardToken;
    }

    console.log('[Asaas Buy] Enviando cobrança...');
    const paymentRes = await fetch(`${ASAAS_API_URL}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access_token': asaasApiKey },
      body: JSON.stringify(paymentBody)
    });

    const paymentData = await paymentRes.json();

    if (!paymentRes.ok) {
        // Se falhou no Asaas, cancelamos a transação no banco para não ficar "pendente" para sempre
        await supabaseAdmin.from('transacoes').update({ status: 'falha' }).eq('id', transacao.id);
        throw new Error(paymentData.errors?.[0]?.description || 'Erro ao criar pagamento no Asaas');
    }

    // 7. Retorno para o Frontend
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
       const pixJson = await pixRes.json();
       response.pixQrCode = pixJson.encodedImage;
       response.pixCopyPaste = pixJson.payload;
    }

    return new Response(JSON.stringify(response), { headers: corsHeaders });

  } catch (error: any) {
    console.error('[Asaas Buy Error]', error);
    return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
  }
});
