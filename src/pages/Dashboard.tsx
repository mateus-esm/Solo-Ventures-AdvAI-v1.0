import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, Users, Calendar, DollarSign, Loader2, RefreshCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Dashboard = () => {
  const [rawData, setRawData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState<string>(currentDate.getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>('all'); // Padrão: Ano todo

  // Função única de carga
  const fetchKPIs = async (forceSync = false) => {
    try {
      setLoading(true);
      
      // Se for sync forçado, chama a edge function. Se não, tenta pegar do banco local primeiro.
      let data;
      
      if (forceSync) {
        const response = await supabase.functions.invoke('fetch-jestor-kpis');
        if (response.error) throw new Error(response.error.message || 'Erro na sincronização');
        data = response.data;
        toast({ title: "Sincronizado!", description: "Dados atualizados do Jestor." });
      } else {
        const dbResponse = await supabase.from('kpis_dashboard').select('*').order('periodo', { ascending: false });
        data = dbResponse.data;
      }

      if (data) setRawData(data);

    } catch (error: any) {
      console.error(error);
      toast({ title: "Erro", description: "Falha ao carregar dados.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Tenta carregar do banco primeiro (rápido), se vazio, chama sync
    const init = async () => {
      const { count } = await supabase.from('kpis_dashboard').select('*', { count: 'exact', head: true });
      if (count === 0) fetchKPIs(true);
      else fetchKPIs(false);
    };
    init();
  }, []);

  // --- Cálculos de Interface ---

  // 1. Dados para os CARDS (Soma baseada no filtro)
  const getCardMetrics = () => {
    // Filtra pelo ano
    let filtered = rawData.filter(d => d.periodo.startsWith(selectedYear));

    // Se tiver mês selecionado, filtra pelo mês
    if (selectedMonth !== 'all') {
      const target = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
      filtered = filtered.filter(d => d.periodo === target);
    }

    // Soma totais
    const totals = filtered.reduce((acc, curr) => ({
      leads: acc.leads + (curr.leads_atendidos || 0),
      reunioes: acc.reunioes + (curr.reunioes_agendadas || 0),
      vendas: acc.vendas + (curr.negocios_fechados || 0),
      valor: acc.valor + (curr.valor_total_negocios || 0)
    }), { leads: 0, reunioes: 0, vendas: 0, valor: 0 });

    // Taxas
    const txReuniao = totals.leads ? ((totals.reunioes / totals.leads) * 100).toFixed(1) : '0';
    const txVenda = totals.reunioes ? ((totals.vendas / totals.reunioes) * 100).toFixed(1) : '0';

    return { ...totals, txReuniao, txVenda };
  };

  // 2. Dados para o GRÁFICO (Sempre mostra o ano todo para comparar)
  const getChartData = () => {
    // Cria array com os 12 meses vazios
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = (i + 1).toString().padStart(2, '0');
      return { 
        name: new Date(2000, i).toLocaleString('pt-BR', { month: 'short' }), 
        fullPeriod: `${selectedYear}-${m}`,
        Leads: 0, 
        Reunioes: 0, 
        Vendas: 0 
      };
    });

    // Preenche com os dados reais
    rawData.forEach(d => {
      if (d.periodo.startsWith(selectedYear)) {
        const monthIndex = parseInt(d.periodo.split('-')[1]) - 1;
        if (months[monthIndex]) {
          months[monthIndex].Leads = d.leads_atendidos;
          months[monthIndex].Reunioes = d.reunioes_agendadas;
          months[monthIndex].Vendas = d.negocios_fechados;
        }
      }
    });

    return months;
  };

  const metrics = getCardMetrics();
  const chartData = getChartData();

  return (
    <div className="flex-1 flex flex-col p-6 space-y-6">
      
      {/* Header e Filtros */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard Comercial</h1>
          <p className="text-muted-foreground">Acompanhamento de performance do Agente</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ano Completo</SelectItem>
              {Array.from({length: 12}, (_, i) => (
                <SelectItem key={i+1} value={(i+1).toString()}>
                  {new Date(0, i).toLocaleString('pt-BR', { month: 'long' })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" onClick={() => fetchKPIs(true)} disabled={loading}>
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Cards de KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Leads Atendidos</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2"><Users className="h-5 w-5 text-blue-500"/> {metrics.leads}</div>
            <p className="text-xs text-muted-foreground mt-1">Base de cálculo para conversão</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Reuniões</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2"><Calendar className="h-5 w-5 text-purple-500"/> {metrics.reunioes}</div>
            <p className="text-xs text-muted-foreground mt-1 text-green-600 font-medium">{metrics.txReuniao}% de conversão</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Vendas</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="h-5 w-5 text-green-500"/> {metrics.vendas}</div>
            <p className="text-xs text-muted-foreground mt-1 text-green-600 font-medium">{metrics.txVenda}% de fechamento</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Receita</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2"><DollarSign className="h-5 w-5 text-yellow-500"/> {metrics.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            <p className="text-xs text-muted-foreground mt-1">Valor total em propostas</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico Anual */}
      <Card className="col-span-1">
        <CardHeader>
          <CardTitle>Performance Anual - {selectedYear}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                  itemStyle={{ color: 'var(--foreground)' }}
                />
                <Legend />
                <Bar name="Leads" dataKey="Leads" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar name="Reuniões" dataKey="Reunioes" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar name="Vendas" dataKey="Vendas" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

    </div>
  );
};

export default Dashboard;
