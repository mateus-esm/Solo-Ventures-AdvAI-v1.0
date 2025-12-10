import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseClient.auth.getUser(token);

    if (!user) throw new Error('Unauthorized');

    let reqBody: { year?: string; month?: string } = {};
    try { reqBody = await req.json(); } catch {}
    
    const now = new Date();
    const year = reqBody.year ? parseInt(reqBody.year) : now.getFullYear();
    const month = reqBody.month ? parseInt(reqBody.month) : now.getMonth() + 1;
    const periodo = `${year}-${month.toString().padStart(2, '0')}`;

    // 1. Busca perfil e equipe
    const { data: profile } = await supabaseClient.from('profiles').select('equipe_id').eq('user_id', user.id).single();
    if (!profile) throw new Error('Profile not found');

    // CORREÇÃO: Query ajustada para garantir o join correto
    const { data: equipe } = await supabaseClient
      .from('equipes')
      .select(`
        gpt_maker_agent_id, 
        limite_creditos, 
        creditos_avulsos, 
        plano_id, 
        planos ( limite_creditos )
      `)
      .eq('id', profile.equipe_id)
      .single();

    if (!equipe) throw new Error('Equipe não encontrada');

    // 2. Busca consumo no GPT Maker
    let creditsSpent = 0;
    if (equipe.gpt_maker_agent_id) {
        const gptMakerToken = Deno.env.get('GPT_MAKER_API_TOKEN');
        const spentUrl = `https://api.gptmaker.ai/v2/agent/${equipe.gpt_maker_agent_id}/credits-spent?year=${year}&month=${month}`;
        
        try {
            const spentRes = await fetch(spentUrl, { 
                headers: { 'Authorization': `Bearer ${gptMakerToken}`, 'Content-Type': 'application/json' } 
            });
            if (spentRes.ok) {
                const spentData = await spentRes.json();
                creditsSpent = spentData.total || 0;
            }
        } catch (e) {
            console.error("Erro GPT Maker API:", e);
        }
    }

    // CORREÇÃO LÓGICA DE LIMITE
    // Se equipe.limite_creditos for nulo, pega do plano. Se plano for array (pode acontecer no join), pega o primeiro.
    let limitePlano = 1000; // Default
    if (equipe.limite_creditos) {
        limitePlano = equipe.limite_creditos;
    } else if (equipe.planos) {
        // Supabase pode retornar objeto ou array dependendo da versão/config
        const p = Array.isArray(equipe.planos) ? equipe.planos[0] : equipe.planos;
        if (p?.limite_creditos) limitePlano = p.limite_creditos;
    }

    const totalCredits = limitePlano + (equipe.creditos_avulsos || 0);
    const creditsBalance = totalCredits - creditsSpent;

    // Atualiza histórico local
    await supabaseClient.from('consumo_creditos').upsert({
      equipe_id: profile.equipe_id, 
      creditos_utilizados: creditsSpent, 
      periodo
    }, { onConflict: 'equipe_id,periodo' });

    return new Response(JSON.stringify({
      creditsSpent,
      creditsBalance,
      totalCredits,
      planLimit: limitePlano,
      extraCredits: equipe.creditos_avulsos,
      periodo
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
