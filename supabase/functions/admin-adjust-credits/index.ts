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

    // Validar autenticação
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseClient.auth.getUser(token);

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // TODO: Adicionar validação de permissão admin aqui
    // Por enquanto, qualquer usuário autenticado pode usar (ajustar depois)
    console.log(`Admin action by user: ${user.id}`);

    const { equipe_id, action, amount, reason } = await req.json();

    if (!equipe_id || !action || !reason) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: equipe_id, action, reason' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Buscar equipe atual
    const { data: equipe, error: equipeError } = await supabaseClient
      .from('equipes')
      .select('id, nome_cliente, creditos_avulsos, limite_creditos, gpt_maker_agent_id')
      .eq('id', equipe_id)
      .single();

    if (equipeError || !equipe) {
      return new Response(
        JSON.stringify({ error: 'Team not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    const previousExtraCredits = equipe.creditos_avulsos || 0;
    let newExtraCredits = previousExtraCredits;
    let currentConsumption = 0;

    // Processar ações
    switch (action) {
      case 'reset_balance':
        // Buscar consumo atual da API GPT Maker
        if (!equipe.gpt_maker_agent_id) {
          return new Response(
            JSON.stringify({ error: 'GPT Maker Agent ID not configured for this team' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        const gptMakerToken = Deno.env.get('GPT_MAKER_API_TOKEN');
        if (!gptMakerToken) {
          return new Response(
            JSON.stringify({ error: 'GPT Maker API token not configured' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const spentUrl = `https://api.gptmaker.ai/v2/agent/${equipe.gpt_maker_agent_id}/credits-spent?year=${year}&month=${month}`;

        const spentRes = await fetch(spentUrl, { 
          headers: { 'Authorization': `Bearer ${gptMakerToken}`, 'Content-Type': 'application/json' } 
        });

        if (!spentRes.ok) {
          const err = await spentRes.text();
          console.error("Erro API Agent Spent:", err);
          return new Response(
            JSON.stringify({ error: `GPT Maker API error: ${spentRes.status}` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        const spentData = await spentRes.json();
        currentConsumption = spentData.total || 0;

        // Ajustar creditos_avulsos para compensar o consumo
        newExtraCredits = previousExtraCredits + currentConsumption;
        break;

      case 'add_credits':
        if (!amount || amount <= 0) {
          return new Response(
            JSON.stringify({ error: 'Amount must be a positive number' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
        newExtraCredits = previousExtraCredits + amount;
        break;

      case 'remove_credits':
        if (!amount || amount <= 0) {
          return new Response(
            JSON.stringify({ error: 'Amount must be a positive number' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
        newExtraCredits = previousExtraCredits - amount;
        break;

      case 'clear_extra_credits':
        newExtraCredits = 0;
        break;

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action. Use: reset_balance, add_credits, remove_credits, clear_extra_credits' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }

    // Atualizar creditos_avulsos na tabela equipes
    const { error: updateError } = await supabaseClient
      .from('equipes')
      .update({ creditos_avulsos: newExtraCredits })
      .eq('id', equipe_id);

    if (updateError) {
      console.error("Erro ao atualizar creditos_avulsos:", updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update extra credits' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Registrar log no metadata de consumo_creditos
    const periodo = `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}`;
    
    const adjustmentLog = {
      timestamp: new Date().toISOString(),
      action,
      previous_extra_credits: previousExtraCredits,
      new_extra_credits: newExtraCredits,
      amount: amount || null,
      current_consumption: currentConsumption || null,
      reason,
      admin_user_id: user.id,
      admin_email: user.email
    };

    // Buscar ou criar registro de consumo_creditos
    const { data: consumoData } = await supabaseClient
      .from('consumo_creditos')
      .select('metadata')
      .eq('equipe_id', equipe_id)
      .eq('periodo', periodo)
      .single();

    let existingMetadata = consumoData?.metadata || {};
    let adjustments = existingMetadata.adjustments || [];
    adjustments.push(adjustmentLog);

    await supabaseClient
      .from('consumo_creditos')
      .upsert({
        equipe_id,
        periodo,
        creditos_utilizados: currentConsumption || 0,
        metadata: { ...existingMetadata, adjustments }
      }, { onConflict: 'equipe_id,periodo', ignoreDuplicates: false });

    console.log(`Credit adjustment completed for team ${equipe.nome_cliente}:`, adjustmentLog);

    return new Response(JSON.stringify({
      success: true,
      team: equipe.nome_cliente,
      action,
      previous_extra_credits: previousExtraCredits,
      new_extra_credits: newExtraCredits,
      adjustment: newExtraCredits - previousExtraCredits,
      current_consumption: currentConsumption || null,
      new_balance: (equipe.limite_creditos + newExtraCredits) - (currentConsumption || 0),
      log: adjustmentLog
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error in admin-adjust-credits:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
