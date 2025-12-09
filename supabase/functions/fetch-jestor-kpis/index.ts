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
    let reqBody = {};
    try { reqBody = await req.json(); } catch {}
    
    const now = new Date();
    // Atenção: Se o frontend não mandar mês, pega o atual.
    const targetMonth = reqBody.month ? parseInt(reqBody.month) : now.getMonth() + 1;
    const targetYear = reqBody.year ? parseInt(reqBody.year) : now.getFullYear();
    
    // Intervalo exato do mês (Coorte)
    const firstDay = new Date(targetYear, targetMonth - 1, 1);
    const lastDay = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);
    
    const periodoString = `${targetYear}-${targetMonth.toString().padStart(2, '0')}`;
    console.log(`[Jestor KPI] Iniciando análise para Coorte: ${periodoString}`);

    // 2. Buscar dados do Jestor
    // Limit alto para garantir que pegamos todo o histórico recente
    const jestorUrl = 'https://mateussmaia.api.jestor.com/object/list';
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
        limit: 5000, 
        sort: 'criado_em', // Tenta ordenar por data para pegar os mais recentes se houver limite
        direction: 'desc'
    };

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
    let leads = [];
    if (Array.isArray(json.data)) leads = json.data;
    else if (json.data?.items) leads = json.data.items;
    
    console.log(`[Jestor KPI] Total de registros baixados: ${leads.length}`);

    // 3. Filtragem e Cálculos
    // Função para tratar datas do Jestor (ISO ou BR)
    const parseJestorDate = (val: any) => {
        if (!val) return null;
        const s = String(val).trim();
        // Formato ISO: "2025-11-05T..."
        if (s.includes('-') && s.includes('T')) return new Date(s);
        // Formato BR: "05/11/2025"
        if (s.includes('/')) {
            const [d, m, y] = s.split('/');
            // Verifica se tem hora "05/11/2025 14:30"
            if (y.includes(' ')) {
                const [yearPart, timePart] = y.split(' ');
                return new Date(parseInt(yearPart), parseInt(m)-1, parseInt(d));
            }
            return new Date(parseInt(y), parseInt(m)-1, parseInt(d));
        }
        // Tentativa genérica
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    };

    // Filtra leads que NASCERAM no mês selecionado (Coorte)
    const leadsDoMes = leads.filter((lead: any) => {
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
        return r === true || r === 'true' || r === 1;
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
                // Remove R$, espaços e converte vírgula decimal se houver
                v = parseFloat(v.replace(/[^\d,.-]/g, '').replace(',', '.'));
            }
            return acc + (Number(v) || 0);
        }, 0);

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
        periodo: periodoString
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[Jestor KPI] Erro Fatal:', error);
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
