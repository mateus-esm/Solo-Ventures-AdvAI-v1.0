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

    const { data: profile } = await supabaseClient.from('profiles').select('equipe_id').eq('user_id', user.id).single();
    if (!profile) throw new Error('Profile not found');

    // Busca o ID do agente, limite do plano E créditos avulsos
    const { data: equipe } = await supabaseClient
      .from('equipes')
      .select('gpt_maker_agent_id, limite_creditos, creditos_avulsos')
      .eq('id', profile.equipe_id)
      .single();

    if (!equipe?.gpt_maker_agent_id) {
      return new Response(
        JSON.stringify({ error: 'GPT Maker Agent ID not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const gptMakerToken = Deno.env.get('GPT_MAKER_API_TOKEN');
    if (!gptMakerToken) throw new Error('GPT Maker API token not configured');

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Chama apenas a API de consumo (v2)
    const spentUrl = `https://api.gptmaker.ai/v2/agent/${equipe.gpt_maker_agent_id}/credits-spent?year=${year}&month=${month}`;

    const spentRes = await fetch(spentUrl, { 
      headers: { 'Authorization': `Bearer ${gptMakerToken}`, 'Content-Type': 'application/json' } 
    });

    if (!spentRes.ok) {
        const err = await spentRes.text();
        console.error("Erro API Agent Spent:", err);
        throw new Error(`GPT Maker Agent API error: ${spentRes.status}`);
    }

    const spentData = await spentRes.json();
    
    // LOG PARA CONFERÊNCIA
    console.log("JSON Retornado pelo GPT Maker:", spentData);

    // --- LÓGICA DE SALDO COM CRÉDITOS AVULSOS ---
    // Lê o campo "total" do JSON
    const creditsSpent = spentData.total || 0; 
    
    // Pega o limite do banco (ou usa 1000 como padrão)
    const planLimit = equipe.limite_creditos || 1000;
    const extraCredits = equipe.creditos_avulsos || 0;
    const totalCredits = planLimit + extraCredits;

    // Calcula o saldo do cliente localmente
    const creditsBalance = totalCredits - creditsSpent;

    const periodo = `${year}-${month.toString().padStart(2, '0')}`;

    // Salva no banco
    await supabaseClient.from('consumo_creditos').upsert({
      equipe_id: profile.equipe_id, 
      creditos_utilizados: creditsSpent, 
      periodo, 
      metadata: spentData
    }, { onConflict: 'equipe_id,periodo', ignoreDuplicates: false });

    return new Response(JSON.stringify({
      creditsSpent: creditsSpent,
      creditsBalance: creditsBalance,
      totalCredits: totalCredits,
      periodo
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
