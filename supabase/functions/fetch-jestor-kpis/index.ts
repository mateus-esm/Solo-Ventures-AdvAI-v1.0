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

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('equipe_id')
      .eq('user_id', user.id)
      .single();

    if (!profile) throw new Error('Profile not found');

    const { data: equipe } = await supabaseClient
      .from('equipes')
      .select('jestor_api_token')
      .eq('id', profile.equipe_id)
      .single();

    if (!equipe?.jestor_api_token) {
      return new Response(
        JSON.stringify({ error: 'Jestor API token not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const jestorToken = equipe.jestor_api_token;
    
    // Parse request body for custom date range
    let requestBody: any = {};
    try {
      requestBody = await req.json();
    } catch {
      // If no body, use current month
    }
    
    const targetMonth = requestBody.month ? parseInt(requestBody.month) : new Date().getMonth() + 1;
    const targetYear = requestBody.year ? parseInt(requestBody.year) : new Date().getFullYear();
    
    const firstDay = new Date(targetYear, targetMonth - 1, 1);
    const lastDay = new Date(targetYear, targetMonth, 0);
    const periodo = `${targetYear}-${targetMonth.toString().padStart(2, '0')}`;

    console.log(`[Jestor] Buscando dados para o período: ${periodo}`);

    // Buscar TODOS os leads com paginação usando offset
    let allLeads: any[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    console.log('[Jestor] Iniciando busca de leads com paginação...');

    while (hasMore) {
      console.log(`[Jestor] Buscando registros com offset ${offset}, limit ${limit}...`);
      
      const leadsResponse = await fetch('https://mateussmaia.api.jestor.com/object/list', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jestorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          object_type: 'o_apnte00i6bwtdfd2rjc',
          fields: ['*'],
          limit: limit,
          offset: offset
        }),
      });

      if (!leadsResponse.ok) {
        const errText = await leadsResponse.text();
        console.error("[Jestor] Erro API:", errText);
        throw new Error(`Failed to fetch Jestor data: ${leadsResponse.status}`);
      }

      const leadsData = await leadsResponse.json();
      
      // Log da estrutura apenas na primeira iteração
      if (offset === 0) {
        console.log("[Jestor] Estrutura da resposta:", JSON.stringify(leadsData).substring(0, 800));
        
        // Verifica se há informação de total
        if (leadsData.data?.total) {
          console.log(`[Jestor] Total de registros disponíveis: ${leadsData.data.total}`);
        }
      }

      let batchLeads: any[] = [];
      
      if (Array.isArray(leadsData.data)) {
        batchLeads = leadsData.data;
      } else if (leadsData.data && Array.isArray(leadsData.data.items)) {
        batchLeads = leadsData.data.items;
      } else if (Array.isArray(leadsData)) {
        batchLeads = leadsData;
      } else {
        console.error("[Jestor] ERRO: 'data' não é uma lista!", leadsData);
        batchLeads = [];
      }

      console.log(`[Jestor] Offset ${offset}: ${batchLeads.length} registros recuperados`);

      if (batchLeads.length === 0) {
        hasMore = false;
      } else {
        allLeads = allLeads.concat(batchLeads);
        
        // Se retornou menos que o limit, não há mais registros
        if (batchLeads.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
        }
      }
    }

    const leads = allLeads;

    console.log(`[Jestor] Total de registros processados: ${leads.length}`);
    console.log(`[Jestor] Período de filtro: ${firstDay.toISOString()} até ${lastDay.toISOString()}`);

    // Filtra leads criados no mês atual
    const currentMonthLeads = leads.filter((lead: any) => {
      if (!lead.criado_em) {
        console.log(`[Jestor] Lead SEM data criado_em:`, { name: lead.name, id: lead.id_o_apnte00i6bwtdfd2rjc });
        return false;
      }
      const createdDate = new Date(lead.criado_em);
      const isInPeriod = createdDate >= firstDay && createdDate <= lastDay;
      
      if (!isInPeriod) {
        console.log(`[Jestor] Lead FORA do período:`, { 
          name: lead.name, 
          criado_em: lead.criado_em, 
          createdDate: createdDate.toISOString() 
        });
      } else {
        console.log(`[Jestor] Lead NO período:`, { 
          name: lead.name, 
          criado_em: lead.criado_em,
          status: lead.status,
          reuniao_agendada: lead.reuniao_agendada
        });
      }
      
      return isInPeriod;
    });

    const leadsAtendidos = currentMonthLeads.length;
    console.log(`[Jestor] Leads no período atual: ${leadsAtendidos}`);

    // APENAS reuniões com checkbox marcado como true
    const reunioesAgendadas = currentMonthLeads.filter((lead: any) => {
      const isReuniao = lead.reuniao_agendada === true || lead.reuniao_agendada === 'true';
      
      if (isReuniao) {
        console.log(`[Jestor] Reunião IDENTIFICADA (checkbox=true):`, {
          name: lead.name,
          status: lead.status,
          reuniao_agendada: lead.reuniao_agendada
        });
      }
      
      return isReuniao;
    }).length;
    
    console.log(`[Jestor] Total de reuniões agendadas: ${reunioesAgendadas}`);

    const negociosFechados = currentMonthLeads.filter((lead: any) => {
      const s = String(lead.status || '').toLowerCase();
      return s.includes('fechado') || s.includes('ganho') || s === 'contratado' || s.includes('venda');
    }).length;

    const valorTotalNegocios = currentMonthLeads
      .filter((lead: any) => {
          const s = String(lead.status || '').toLowerCase();
          return s.includes('fechado') || s.includes('ganho') || s === 'contratado' || s.includes('venda');
      })
      .reduce((sum: number, lead: any) => sum + (parseFloat(lead.valor_da_proposta) || 0), 0);

    const taxaConversaoReuniao = leadsAtendidos > 0 ? ((reunioesAgendadas / leadsAtendidos) * 100).toFixed(1) : '0.0';
    const taxaConversaoNegocio = reunioesAgendadas > 0 ? ((negociosFechados / reunioesAgendadas) * 100).toFixed(1) : '0.0';

    await supabaseClient.from('kpis_dashboard').upsert({
      equipe_id: profile.equipe_id,
      leads_atendidos: leadsAtendidos,
      reunioes_agendadas: reunioesAgendadas,
      negocios_fechados: negociosFechados,
      valor_total_negocios: valorTotalNegocios,
      periodo: periodo,
    }, { onConflict: 'equipe_id,periodo', ignoreDuplicates: false });

    return new Response(JSON.stringify({
      leadsAtendidos, reunioesAgendadas, negociosFechados, valorTotalNegocios,
      taxaConversaoReuniao, taxaConversaoNegocio, periodo
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[Jestor] Erro Fatal:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

