import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, Users, Calendar, DollarSign, Loader2, RefreshCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface KPIRecord {
  periodo: string;
  leads_atendidos: number;
  reunioes_agendadas: number;
  negocios_fechados: number;
  valor_total_negocios: number;
}

const Dashboard = () => {
  const [rawData, setRawData] = useState<KPIRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState<string>(currentDate.getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>((currentDate.getMonth() + 1).toString());

  // Busca todos os KPIs do backend (sincroniza com Jestor)
  const fetchKPIs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('fetch-jestor-kpis');

      if (error) throw error;

      if (Array.isArray(data)) {
        setRawData(data);
      }
    } catch (error: any) {
      console.error('Error fetching KPIs:', error);
      toast({
        title: "Erro de Sincronização",
        description: "Carregando cache local...",
        variant: "destructive",
      });
      // Fallback: lê do banco local
      await fetchLocalData();
    } finally {
      setLoading(false);
    }
  };

  // Fallback para cache local
  const fetchLocalData = async () => {
    const { data } = await supabase
      .from('kpis_dashboard')
      .select('periodo, leads_atendidos, reunioes_agendadas, negocios_fechados, valor_total_negocios')
      .order('periodo', { ascending: false });
    if (data) setRawData(data as KPIRecord[]);
  };

  useEffect(() => {
    fetchKPIs();
  }, []);

  // Dados do gráfico: todos os meses do ano selecionado
  const chartData = rawData
    .filter(d => d.periodo.startsWith(selectedYear))
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map(d => {
      const [year, month] = d.periodo.split('-');
      const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('pt-BR', { month: 'short' });
      return {
        name: monthName.charAt(0).toUpperCase() + monthName.slice(1),
        Leads: d.leads_atendidos,
        Reuniões: d.reunioes_agendadas,
        Vendas: d.negocios_fechados,
      };
    });

  // Cálculo das métricas para os cards (filtra por mês ou ano completo)
  const calculateMetrics = () => {
    let filtered = rawData.filter(d => d.periodo.startsWith(selectedYear));

    if (selectedMonth !== 'all') {
      const targetPeriod = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
      filtered = filtered.filter(d => d.periodo === targetPeriod);
    }

    const totals = filtered.reduce((acc, curr) => ({
      leads: acc.leads + (curr.leads_atendidos || 0),
      meetings: acc.meetings + (curr.reunioes_agendadas || 0),
      deals: acc.deals + (curr.negocios_fechados || 0),
      value: acc.value + (curr.valor_total_negocios || 0)
    }), { leads: 0, meetings: 0, deals: 0, value: 0 });

    const conversionMeeting = totals.leads > 0 ? ((totals.meetings / totals.leads) * 100).toFixed(1) : '0.0';
    const conversionDeal = totals.meetings > 0 ? ((totals.deals / totals.meetings) * 100).toFixed(1) : '0.0';

    return { ...totals, conversionMeeting, conversionDeal };
  };

  const metrics = calculateMetrics();

  // Descrição do período selecionado
  const getPeriodLabel = () => {
    if (selectedMonth === 'all') {
      return `Ano ${selectedYear}`;
    }
    const monthName = new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1).toLocaleString('pt-BR', { month: 'long' });
    return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${selectedYear}`;
  };

  if (loading && rawData.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-border bg-gradient-to-r from-background to-muted/30">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Dashboard <span className="text-primary">Performance</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Análise de Resultados do Agente AdvAI • {getPeriodLabel()}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Ano Completo</SelectItem>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                    <SelectItem key={month} value={month.toString()}>
                      {new Date(2000, month - 1).toLocaleDateString('pt-BR', { month: 'long' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026].map((year) => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button onClick={fetchKPIs} variant="outline" size="icon" title="Sincronizar com Jestor" disabled={loading}>
                <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 container mx-auto px-4 py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Leads Atendidos</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.leads}</div>
              <p className="text-xs text-muted-foreground">Total no período</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reuniões Agendadas</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.meetings}</div>
              <p className="text-xs text-muted-foreground">{metrics.conversionMeeting}% de conversão (Lead → Reunião)</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Negócios Fechados</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.deals}</div>
              <p className="text-xs text-muted-foreground">{metrics.conversionDeal}% de conversão (Reunião → Venda)</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                R$ {metrics.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">Receita gerada</p>
            </CardContent>
          </Card>
        </div>

        {/* Chart - Comparativo Anual */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Anual ({selectedYear})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                    <XAxis dataKey="name" className="text-muted-foreground" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis className="text-muted-foreground" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Legend />
                    <Bar dataKey="Leads" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Reuniões" fill="hsl(263, 70%, 50%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Vendas" fill="hsl(160, 84%, 39%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  Nenhum dado encontrado para {selectedYear}.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
