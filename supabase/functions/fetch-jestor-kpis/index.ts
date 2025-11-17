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
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const periodo = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;

    console.log(`Buscando dados do Jestor para o período: ${periodo}`);

    // URL da sua organização
    const leadsResponse = await fetch('https://mateussmaia.api.jestor.com/object/list', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jestorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        object_type: 'o_apnte00i6bwtdfd2rjc',
        fields: ['*'],
        limit: 10000
      }),
    });

    if (!leadsResponse.ok) {
      const errText = await leadsResponse.text();
      console.error("Erro Jestor API:", errText);
      throw new Error(`Failed to fetch Jestor data: ${leadsResponse.status}`);
    }

    const leadsData = await leadsResponse.json();
    const leads = leadsData.data || [];

    // --- DIAGNÓSTICO (IMPORTANTE) ---
    // Isso vai imprimir no log do Supabase os Status exatos que estão vindo
    if (leads.length > 0) {
        const exemplos = leads.slice(0, 5).map((l: any) => ({
            status: l.status,
            reuniao_agendada: l.reuniao_agendada
        }));
        console.log("Amostra de dados (Status / Reuniao):", JSON.stringify(exemplos));
        
        const todosStatus = [...new Set(leads.map((l: any) => String(l.status)))];
        console.log("LISTA DE TODOS OS STATUS ENCONTRADOS:", todosStatus);
    }
    // --------------------------------

    // Filtra leads criados no mês atual
    const currentMonthLeads = leads.filter((lead: any) => {
      if (!lead.criado_em) return false;
      const createdDate = new Date(lead.criado_em);
      return createdDate >= firstDay && createdDate <= lastDay;
    });

    const leadsAtendidos = currentMonthLeads.length;

    // CORREÇÃO 1: Verifica Status OU o campo específico 'reuniao_agendada'
    const reunioesAgendadas = currentMonthLeads.filter((lead: any) => {
      const s = String(lead.status || '').toLowerCase();
      // Verifica se o campo 'reuniao_agendada' existe e é verdadeiro (ou não vazio)
      const temFlagReuniao = lead.reuniao_agendada === true || lead.reuniao_agendada === 'true' || (lead.reuniao_agendada && lead.reuniao_agendada !== 'false');
      // Verifica o status por texto
      const statusReuniao = s.includes('agendada') || s.includes('reunião') || s === 'agendado';
      
      return temFlagReuniao || statusReuniao;
    }).length;

    // CORREÇÃO 2: Verifica Status "Fechado" de forma mais ampla
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

    // Atualiza o banco
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
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
