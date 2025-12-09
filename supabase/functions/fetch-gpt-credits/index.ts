import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseClient.auth.getUser(token);

    if (!user) throw new Error('Unauthorized');

    // 1. Ler Mês/Ano do Body da requisição
    let reqBody: { year?: string; month?: string } = {};
    try { reqBody = await req.json(); } catch {}
    
    const now = new Date();
    // Se não vier no body, usa o mês atual
    const year = reqBody.year ? parseInt(reqBody.year) : now.getFullYear();
    const month = reqBody.month ? parseInt(reqBody.month) : now.getMonth() + 1;
    const periodo = `${year}-${month.toString().padStart(2, '0')}`;

    console.log(`[GPT Credits] Buscando consumo para: ${periodo}`);

    const { data: profile } = await supabaseClient.from('profiles').select('equipe_id').eq('user_id', user.id).single();
    if (!profile) throw new Error('Profile not found');

    const { data: equipe } = await supabaseClient
      .from('equipes')
      .select('gpt_maker_agent_id, limite_creditos, creditos_avulsos')
      .eq('id', profile.equipe_id)
      .single();

    if (!equipe?.gpt_maker_agent_id) throw new Error('Agent ID missing');

    const gptMakerToken = Deno.env.get('GPT_MAKER_API_TOKEN');
    
    // 2. Chamada GPT Maker com Filtro de Data
    // A API v2 do GPT Maker aceita ?year=YYYY&month=MM para retornar o total exato daquele mês
    const spentUrl = `https://api.gptmaker.ai/v2/agent/${equipe.gpt_maker_agent_id}/credits-spent?year=${year}&month=${month}`;
    
    const spentRes = await fetch(spentUrl, { 
      headers: { 'Authorization': `Bearer ${gptMakerToken}`, 'Content-Type': 'application/json' } 
    });

    if (!spentRes.ok) {
        const errText = await spentRes.text();
        console.error(`[GPT API Error] ${spentRes.status}: ${errText}`);
        throw new Error('Failed to fetch from GPT Maker');
    }
    
    const spentData = await spentRes.json();
    // O campo 'total' retorna o consumo do período especificado
    const creditsSpent = spentData.total || 0; 

    // Calculo de saldo (sempre baseado no snapshot atual de limites)
    const totalCredits = (equipe.limite_creditos || 1000) + (equipe.creditos_avulsos || 0);
    const creditsBalance = totalCredits - creditsSpent;

    // Salvar histórico no banco
    await supabaseClient.from('consumo_creditos').upsert({
      equipe_id: profile.equipe_id, 
      creditos_utilizados: creditsSpent, 
      periodo, 
      metadata: spentData // Guarda o JSON bruto para auditoria
    }, { onConflict: 'equipe_id,periodo' });

    return new Response(JSON.stringify({
      creditsSpent,
      creditsBalance,
      totalCredits,
      planLimit: equipe.limite_creditos,
      extraCredits: equipe.creditos_avulsos,
      periodo
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
