import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOW_CREDIT_THRESHOLD = 100;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[Check Low Credits] Starting credit balance check...');

    // Initialize Supabase client with service role key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const gptMakerToken = Deno.env.get('GPT_MAKER_API_TOKEN');
    if (!gptMakerToken) {
      throw new Error('GPT_MAKER_API_TOKEN not configured');
    }

    // Get all active teams
    const { data: equipes, error: equipesError } = await supabaseClient
      .from('equipes')
      .select('id, nome_cliente, gpt_maker_agent_id, limite_creditos, creditos_avulsos')
      .not('gpt_maker_agent_id', 'is', null);

    if (equipesError) {
      console.error('[Check Low Credits] Error fetching teams:', equipesError);
      throw equipesError;
    }

    console.log(`[Check Low Credits] Checking ${equipes?.length || 0} teams`);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const periodo = `${year}-${month.toString().padStart(2, '0')}`;

    let alertsSent = 0;

    for (const equipe of equipes || []) {
      try {
        // Fetch credits spent from GPT Maker API
        const spentUrl = `https://api.gptmaker.ai/v2/agent/${equipe.gpt_maker_agent_id}/credits-spent?year=${year}&month=${month}`;
        
        const spentRes = await fetch(spentUrl, {
          headers: {
            'Authorization': `Bearer ${gptMakerToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!spentRes.ok) {
          console.error(`[Check Low Credits] API error for team ${equipe.nome_cliente}:`, spentRes.status);
          continue;
        }

        const spentData = await spentRes.json();
        const creditsSpent = spentData.total || 0;
        
        const planLimit = equipe.limite_creditos || 1000;
        const extraCredits = equipe.creditos_avulsos || 0;
        const totalCredits = planLimit + extraCredits;
        const creditsBalance = totalCredits - creditsSpent;

        console.log(`[Check Low Credits] Team ${equipe.nome_cliente}: Balance = ${creditsBalance}`);

        // Check if balance is below threshold
        if (creditsBalance < LOW_CREDIT_THRESHOLD && creditsBalance >= 0) {
          console.log(`[Check Low Credits] LOW BALANCE ALERT for ${equipe.nome_cliente}: ${creditsBalance} credits remaining`);

          // Get team owner email
          const { data: profiles, error: profilesError } = await supabaseClient
            .from('profiles')
            .select('email, nome_completo')
            .eq('equipe_id', equipe.id)
            .limit(1);

          if (profilesError || !profiles || profiles.length === 0) {
            console.error(`[Check Low Credits] No profile found for team ${equipe.nome_cliente}`);
            continue;
          }

          const ownerEmail = profiles[0].email;
          const ownerName = profiles[0].nome_completo;

          // Check if we already sent an alert today (to avoid spam)
          const today = new Date().toISOString().split('T')[0];
          const { data: existingAlert } = await supabaseClient
            .from('consumo_creditos')
            .select('metadata')
            .eq('equipe_id', equipe.id)
            .eq('periodo', periodo)
            .single();

          const lastAlertDate = existingAlert?.metadata?.last_low_credit_alert;
          
          if (lastAlertDate === today) {
            console.log(`[Check Low Credits] Alert already sent today for ${equipe.nome_cliente}`);
            continue;
          }

          // Send email notification (using console.log for now - integrate with email service)
          console.log(`[Check Low Credits] SENDING ALERT EMAIL to ${ownerEmail}`);
          console.log({
            to: ownerEmail,
            subject: 'AdvAI - Saldo de Créditos Baixo',
            message: `Olá ${ownerName},\n\nSeu saldo de créditos do AdvAI está abaixo de ${LOW_CREDIT_THRESHOLD}.\n\nSaldo atual: ${creditsBalance} créditos\nTotal disponível: ${totalCredits} créditos\n\nRecarregue para evitar a interrupção do atendimento.\n\nAcesse: https://advai.soloventures.com.br/billing\n\nAtenciosamente,\nEquipe Solo Ventures`
          });

          // Update metadata to track last alert
          await supabaseClient
            .from('consumo_creditos')
            .upsert({
              equipe_id: equipe.id,
              periodo: periodo,
              creditos_utilizados: creditsSpent,
              data_consumo: new Date().toISOString(),
              metadata: {
                ...existingAlert?.metadata,
                last_low_credit_alert: today,
                last_balance_checked: creditsBalance
              }
            }, {
              onConflict: 'equipe_id,periodo'
            });

          alertsSent++;
        }
      } catch (error) {
        console.error(`[Check Low Credits] Error processing team ${equipe.nome_cliente}:`, error);
      }
    }

    console.log(`[Check Low Credits] Completed: ${alertsSent} alerts sent`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Low credit check completed',
        alertsSent: alertsSent,
        teamsChecked: equipes?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('[Check Low Credits] Fatal Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
