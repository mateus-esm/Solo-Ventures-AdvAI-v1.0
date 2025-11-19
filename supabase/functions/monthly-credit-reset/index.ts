import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[Monthly Credit Reset] Starting monthly reset check...');

    // Check if today is the 1st day of the month (UTC-3 = America/Sao_Paulo)
    const now = new Date();
    const saoPauloTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const dayOfMonth = saoPauloTime.getDate();

    console.log('[Monthly Credit Reset] Current date (SP):', saoPauloTime.toISOString(), 'Day:', dayOfMonth);

    // Only proceed if it's the 1st day of the month
    if (dayOfMonth !== 1) {
      console.log('[Monthly Credit Reset] Not the 1st day of the month, skipping reset');
      return new Response(
        JSON.stringify({ message: 'Not the 1st day, no reset needed', day: dayOfMonth }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Initialize Supabase client with service role key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get current period
    const year = saoPauloTime.getFullYear();
    const month = saoPauloTime.getMonth() + 1;
    const periodo = `${year}-${month.toString().padStart(2, '0')}`;

    console.log('[Monthly Credit Reset] Resetting credits for period:', periodo);

    // Get all teams
    const { data: equipes, error: equipesError } = await supabaseClient
      .from('equipes')
      .select('id, nome_cliente');

    if (equipesError) {
      console.error('[Monthly Credit Reset] Error fetching teams:', equipesError);
      throw equipesError;
    }

    console.log(`[Monthly Credit Reset] Found ${equipes?.length || 0} teams to reset`);

    // Reset credits for each team
    let resetCount = 0;
    for (const equipe of equipes || []) {
      try {
        // Delete old consumption records or set to 0
        const { error: upsertError } = await supabaseClient
          .from('consumo_creditos')
          .upsert({
            equipe_id: equipe.id,
            periodo: periodo,
            creditos_utilizados: 0,
            data_consumo: new Date().toISOString(),
            metadata: { reset_type: 'monthly_automatic', reset_at: new Date().toISOString() }
          }, {
            onConflict: 'equipe_id,periodo'
          });

        if (upsertError) {
          console.error(`[Monthly Credit Reset] Error resetting team ${equipe.nome_cliente}:`, upsertError);
        } else {
          resetCount++;
          console.log(`[Monthly Credit Reset] Reset successful for team: ${equipe.nome_cliente}`);
        }
      } catch (error) {
        console.error(`[Monthly Credit Reset] Error processing team ${equipe.nome_cliente}:`, error);
      }
    }

    console.log(`[Monthly Credit Reset] Completed: ${resetCount}/${equipes?.length || 0} teams reset successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Monthly credit reset completed',
        teamsReset: resetCount,
        totalTeams: equipes?.length || 0,
        periodo: periodo
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('[Monthly Credit Reset] Fatal Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
