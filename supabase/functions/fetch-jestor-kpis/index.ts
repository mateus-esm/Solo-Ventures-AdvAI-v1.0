import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // 1. Configuração Básica
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const { data: { user } } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) throw new Error('Unauthorized');

    const { data: profile } = await supabaseClient.from('profiles').select('equipe_id').eq('user_id', user.id).single();
    const { data: equipe } = await supabaseClient.from('equipes').select('jestor_api_token').eq('id', profile.equipe_id).single();
    
    if (!equipe?.jestor_api_token) throw new Error('Token Jestor não configurado');

    console.log('[Jestor] Iniciando sincronização...');

    // 2. Busca de Dados (Loop Simples)
    let allLeads = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch('https://mateussmaia.api.jestor.com/object/list', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${equipe.jestor_api_token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          object_type: 'o_apnte00i6bwtdfd2rjc',
          fields: ['criado_em', 'reuniao_agendada', 'status', 'valor_da_proposta'],
          limit: 100, // Máximo por página
          page: page,
          sort: 'criado_em',
          direction: 'desc'
        })
      });

      if (!response.ok) throw new Error('Erro na API do Jestor');
      
      const json = await response.json();
      const items = json.data?.items || json.data || [];
      
      if (items.length > 0) {
        allLeads.push(...items);
        page++;
      } else {
        hasMore = false;
      }
    }

    console.log(`[Jestor] ${allLeads.length} leads baixados.`);

    // 3. Processamento (Agrupamento por Mês)
    const statsPorMes: Record<string, { leads: number; reunioes: number; vendas: number; valor: number }> = {};

    allLeads.forEach(lead => {
      // Data de criação define o mês (Coorte)
      const dataStr = lead.criado_em;
      if (!dataStr) return;

      // Tratamento simples de data
      let date;
      if (dataStr.includes('/')) { // Formato BR
         const parts = dataStr.split(' ')[0].split('/');
         date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      } else { // Formato ISO
         date = new Date(dataStr);
      }

      if (isNaN(date.getTime())) return;

      const periodo = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      // Cria o objeto do mês se não existir
      if (!statsPorMes[periodo]) {
        statsPorMes[periodo] = { 
          leads: 0, 
          reunioes: 0, 
          vendas: 0, 
          valor: 0 
        };
      }

      // Contabiliza
      const stats = statsPorMes[periodo];
      stats.leads++; // Todo lead conta

      // Reunião (Checkbox marcado)
      if (lead.reuniao_agendada === true || lead.reuniao_agendada === "true") {
        stats.reunioes++;
      }

      // Venda (Status contendo ganho/fechado)
      const status = String(lead.status || '').toLowerCase();
      if (status.includes('ganho') || status.includes('fechado')) {
        stats.vendas++;
        // Valor (se vier como string "R$ 1.000,00" ou number)
        let valor = lead.valor_da_proposta;
        if (typeof valor === 'string') {
           valor = parseFloat(valor.replace(/[^0-9,-]+/g,"").replace(",","."));
        }
        stats.valor += (Number(valor) || 0);
      }
    });

    // 4. Salvar no Banco
    const dadosParaSalvar = Object.entries(statsPorMes).map(([periodo, dados]: [string, any]) => ({
      equipe_id: profile.equipe_id,
      periodo: periodo,
      leads_atendidos: dados.leads,
      reunioes_agendadas: dados.reunioes,
      negocios_fechados: dados.vendas,
      valor_total_negocios: dados.valor,
      updated_at: new Date().toISOString()
    }));

    if (dadosParaSalvar.length > 0) {
      await supabaseClient
        .from('kpis_dashboard')
        .upsert(dadosParaSalvar, { onConflict: 'equipe_id,periodo' });
    }

    // Retorna os dados ordenados para o front já usar
    return new Response(JSON.stringify(dadosParaSalvar.sort((a, b) => b.periodo.localeCompare(a.periodo))), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
