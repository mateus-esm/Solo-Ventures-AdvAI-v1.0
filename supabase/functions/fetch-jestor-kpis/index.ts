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

    const { data: profile } = await supabaseClient.from('profiles').select('equipe_id').eq('user_id', user.id).single();
    if (!profile) throw new Error('Profile not found');

    const { data: equipe } = await supabaseClient.from('equipes').select('jestor_api_token').eq('id', profile.equipe_id).single();
    if (!equipe?.jestor_api_token) throw new Error('Jestor API token not configured');

    // 1. Definição do Período (Coorte)
    let reqBody: { month?: string; year?: string } = {};
    try { reqBody = await req.json(); } catch {}
    
    const now = new Date();
    const targetMonth = reqBody.month ? parseInt(reqBody.month) : now.getMonth() + 1;
    const targetYear = reqBody.year ? parseInt(reqBody.year) : now.getFullYear();
    
    // Intervalo exato do mês (Coorte)
    const firstDay = new Date(targetYear, targetMonth - 1, 1);
    const lastDay = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);
    
    const periodoString = `${targetYear}-${targetMonth.toString().padStart(2, '0')}`;
    console.log(`[Jestor KPI] Iniciando análise para Coorte: ${periodoString}`);

    // 2. Buscar TODOS os dados do Jestor com paginação
    const jestorUrl = 'https://mateussmaia.api.jestor.com/object/list';
    const allLeads: any[] = [];
    let page = 1;
    const pageSize = 100; // Jestor geralmente limita a ~100 por página
    let hasMore = true;

    while (hasMore) {
      const bodyJestor = {
        object_type: 'o_apnte00i6bwtdfd2rjc',
        fields: [
          'id_jestor', 
          'criado_em', 
          'reuniao_agendada', 
          'status', 
          'valor_da_proposta',
          'nome' 
        ],
        limit: pageSize,
        page: page,
        sort: 'criado_em',
        direction: 'desc'
      };

      console.log(`[Jestor KPI] Buscando página ${page}...`);

      const response = await fetch(jestorUrl, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${equipe.jestor_api_token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify(bodyJestor)
      });

      if (!response.ok) throw new Error(`Jestor API Error: ${response.status}`);
      
      const json = await response.json();
      let pageLeads: any[] = [];
      
      if (Array.isArray(json.data)) {
        pageLeads = json.data;
      } else if (json.data?.items) {
        pageLeads = json.data.items;
      } else if (Array.isArray(json.items)) {
        pageLeads = json.items;
      }
      
      console.log(`[Jestor KPI] Página ${page}: ${pageLeads.length} registros`);
      
      if (pageLeads.length === 0) {
        hasMore = false;
      } else {
        allLeads.push(...pageLeads);
        page++;
        
        // Se retornou menos que o pageSize, não há mais páginas
        if (pageLeads.length < pageSize) {
          hasMore = false;
        }
        
        // Limite de segurança para evitar loop infinito
        if (page > 100) {
          console.log('[Jestor KPI] Limite de páginas atingido (100)');
          hasMore = false;
        }
      }
    }
    
    console.log(`[Jestor KPI] Total de registros baixados: ${allLeads.length}`);

    // 3. Filtragem e Cálculos
    const parseJestorDate = (val: any) => {
      if (!val) return null;
      const s = String(val).trim();
      // Formato ISO: "2025-11-05T..."
      if (s.includes('-') && s.includes('T')) return new Date(s);
      // Formato ISO sem T: "2025-11-05"
      if (s.match(/^\d{4}-\d{2}-\d{2}$/)) return new Date(s + 'T00:00:00');
      // Formato BR: "05/11/2025"
      if (s.includes('/')) {
        const [d, m, y] = s.split('/');
        if (y && y.includes(' ')) {
          const [yearPart] = y.split(' ');
          return new Date(parseInt(yearPart), parseInt(m)-1, parseInt(d));
        }
        return new Date(parseInt(y), parseInt(m)-1, parseInt(d));
      }
      // Tentativa genérica
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    };

    // Filtra leads que NASCERAM no mês selecionado (Coorte)
    const leadsDoMes = allLeads.filter((lead: any) => {
      const dataCriacao = parseJestorDate(lead.criado_em);
      if (!dataCriacao) return false;
      return dataCriacao >= firstDay && dataCriacao <= lastDay;
    });

    console.log(`[Jestor KPI] Leads filtrados na coorte ${periodoString}: ${leadsDoMes.length}`);

    // Métricas sobre essa coorte
    const leadsAtendidos = leadsDoMes.length;

    // Reunião Agendada (Campo checkbox: true/false ou string "true")
    const reunioesAgendadas = leadsDoMes.filter((lead: any) => {
      const r = lead.reuniao_agendada;
      return r === true || r === 'true' || r === 1 || r === '1';
    }).length;

    // Negócios Fechados (Campo status: contém "ganho" ou "fechado")
    const negociosFechados = leadsDoMes.filter((lead: any) => {
      const s = String(lead.status || '').toLowerCase();
      return s.includes('ganho') || s.includes('fechado') || s.includes('contrato');
    }).length;

    // Valor (Campo valor_da_proposta)
    const valorTotalNegocios = leadsDoMes
      .filter((lead: any) => {
        const s = String(lead.status || '').toLowerCase();
        return s.includes('ganho') || s.includes('fechado');
      })
      .reduce((acc: number, lead: any) => {
        let v = lead.valor_da_proposta;
        if (typeof v === 'string') {
          v = parseFloat(v.replace(/[^\d,.-]/g, '').replace(',', '.'));
        }
        return acc + (Number(v) || 0);
      }, 0);

    console.log(`[Jestor KPI] Métricas calculadas - Leads: ${leadsAtendidos}, Reuniões: ${reunioesAgendadas}, Fechados: ${negociosFechados}, Valor: ${valorTotalNegocios}`);

    // Salvar no banco (Cache)
    const { error: upsertError } = await supabaseClient.from('kpis_dashboard').upsert({
      equipe_id: profile.equipe_id,
      periodo: periodoString,
      leads_atendidos: leadsAtendidos,
      reunioes_agendadas: reunioesAgendadas,
      negocios_fechados: negociosFechados,
      valor_total_negocios: valorTotalNegocios,
      updated_at: new Date().toISOString()
    }, { onConflict: 'equipe_id,periodo' });

    if (upsertError) console.error('[Jestor KPI] Erro ao salvar:', upsertError);

    return new Response(JSON.stringify({
      leadsAtendidos,
      reunioesAgendadas,
      negociosFechados,
      valorTotalNegocios,
      periodo: periodoString,
      totalRegistrosBaixados: allLeads.length
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[Jestor KPI] Erro Fatal:', error);
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
