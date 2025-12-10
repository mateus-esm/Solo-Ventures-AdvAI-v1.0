import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Zap, Loader2, CheckCircle2, AlertTriangle, ExternalLink, ShieldCheck, X, History, FileText, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface CreditData {
  creditsSpent: number;
  creditsBalance: number;
  totalCredits: number;
  planLimit: number;
  extraCredits: number;
  periodo: string;
}

interface Transacao {
  id: string;
  tipo: string;
  valor: number;
  status: string;
  descricao: string;
  data_transacao: string;
  data_pagamento?: string | null;
  invoice_url?: string;
}

interface HistoricoConsumo {
  periodo: string;
  creditos_utilizados: number;
}

const Billing = () => {
  const { user } = useAuth();
  const [creditData, setCreditData] = useState<CreditData | null>(null);
  const [statusAssinatura, setStatusAssinatura] = useState<string>('active');
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [historicoConsumo, setHistoricoConsumo] = useState<HistoricoConsumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedCredits, setSelectedCredits] = useState<number>(1000);
  
  const currentDate = new Date();
  const [filterMonth, setFilterMonth] = useState<string>((currentDate.getMonth() + 1).toString());
  const [filterYear, setFilterYear] = useState<string>(currentDate.getFullYear().toString());
  const [filterLoading, setFilterLoading] = useState(false);

  const { toast } = useToast();

  const planos = [
    {
      id: 1,
      name: "Solo Starter",
      price: "200",
      description: "Ideal para escritórios iniciando automação",
      features: [
        { text: "1.000 créditos AdvAI/mês", included: true },
        { text: "Até 3 usuários", included: true },
        { text: "Setup completo do Agente", included: true },
        { text: "Central de Atendimento", included: true },
        { text: "Suporte por email", included: true },
        { text: "Pipeline Comercial (CRM)", included: false },
        { text: "Dashboard de KPIs", included: false },
        { text: "Consultoria dedicada", included: false },
      ]
    },
    {
      id: 2,
      name: "Solo Scale",
      price: "400",
      description: "Para escritórios em crescimento acelerado",
      popular: true,
      features: [
        { text: "3.000 créditos AdvAI/mês", included: true },
        { text: "Até 5 usuários", included: true },
        { text: "Setup completo do Agente", included: true },
        { text: "Central de Atendimento", included: true },
        { text: "Suporte prioritário", included: true },
        { text: "Pipeline Comercial (CRM)", included: true },
        { text: "Dashboard de KPIs", included: true },
        { text: "Consultoria mensal inclusa", included: true },
      ]
    },
    {
      id: 3,
      name: "Solo Pro",
      price: "1.000",
      description: "Solução enterprise para alta demanda",
      badge: "Enterprise",
      features: [
        { text: "10.000 créditos AdvAI/mês", included: true },
        { text: "Usuários ilimitados", included: true },
        { text: "Setup completo do Agente", included: true },
        { text: "Central de Atendimento", included: true },
        { text: "Suporte 24/7 dedicado", included: true },
        { text: "Pipeline Comercial (CRM)", included: true },
        { text: "Dashboard de KPIs avançado", included: true },
        { text: "Consultoria semanal", included: true },
      ]
    }
  ];

  const fetchCredits = async (month?: string, year?: string) => {
    try {
      setFilterLoading(true);
      const m = month || filterMonth;
      const y = year || filterYear;

      const { data: creds, error } = await supabase.functions.invoke('fetch-gpt-credits', {
        body: { month: m, year: y }
      });
      
      if (!error && creds) setCreditData(creds);

      if (user) {
        const { data: profile } = await supabase.from('profiles').select('equipe_id').eq('user_id', user.id).single();
        if (profile?.equipe_id) {
            const { data: equipe } = await supabase.from('equipes').select('subscription_status').eq('id', profile.equipe_id).single();
            if (equipe) setStatusAssinatura(equipe.subscription_status || 'active');

            const { data: txs } = await supabase.from('transacoes').select('*').eq('equipe_id', profile.equipe_id).order('data_transacao', { ascending: false }).limit(20);
            if (txs) setTransacoes(txs);

            const { data: cons } = await supabase.from('consumo_creditos').select('*').eq('equipe_id', profile.equipe_id).order('periodo', { ascending: false }).limit(12);
            if (cons) setHistoricoConsumo(cons);
        }
      }
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro", description: "Falha ao carregar dados financeiros." });
    } finally {
      setLoading(false);
      setFilterLoading(false);
    }
  };

  useEffect(() => { if(user) fetchCredits(); }, [user]);

  const handleFilterChange = (type: 'month' | 'year', value: string) => {
    if (type === 'month') {
        setFilterMonth(value);
        fetchCredits(value, filterYear);
    } else {
        setFilterYear(value);
        fetchCredits(filterMonth, value);
    }
  };

  const handleRedirectPayment = async (type: 'credits' | 'plan', value: number) => {
    const loadingKey = type === 'plan' ? value.toString() : 'credits';
    setProcessing(loadingKey);
    
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            toast({ title: "Sessão expirada", description: "Faça login novamente.", variant: "destructive" });
            return;
        }

        toast({ title: "Processando...", description: "Gerando link seguro de pagamento..." });

        let body = {};
        let func = '';

        if (type === 'credits') {
            const amount = (value / 500) * 40; 
            body = { amount, credits: value };
            func = 'asaas-buy-credits';
        } else {
            body = { plano_id: value };
            func = 'asaas-subscribe';
        }

        const { data, error } = await supabase.functions.invoke(func, { body });

        if (error || !data || !data.invoiceUrl) {
            throw new Error(data?.error || error?.message || "Erro ao gerar link de pagamento.");
        }

        // REDIRECIONA PARA O ASAAS
        window.location.href = data.invoiceUrl;

    } catch (error: any) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        setProcessing(null);
    }
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>;

  return (
    <div className="flex-1 flex flex-col p-6 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold">Billing & Assinatura</h1>
          <p className="text-muted-foreground">Gerencie seus pagamentos, planos e limites</p>
        </div>
        <div>
           {statusAssinatura === 'active' ? (
             <Badge className="bg-green-600 hover:bg-green-700 h-8 px-4 text-sm"><CheckCircle2 className="w-4 h-4 mr-2"/> Assinatura Ativa</Badge>
           ) : (
             <Badge variant="destructive" className="h-8 px-4 text-sm"><AlertTriangle className="w-4 h-4 mr-2"/> Pendente</Badge>
           )}
        </div>
      </div>

      {statusAssinatura !== 'active' && (
        <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4"/>
            <AlertTitle>Pagamento Pendente</AlertTitle>
            <AlertDescription>Sua assinatura não foi renovada. Regularize para evitar bloqueios.</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-[400px]">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="plans">Planos</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* CARD DE SALDO */}
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle>Saldo de Créditos</CardTitle>
                            {filterLoading && <Loader2 className="w-4 h-4 animate-spin text-primary"/>}
                        </div>
                        <div className="flex gap-2 mt-2">
                            <Select value={filterMonth} onValueChange={(v) => handleFilterChange('month', v)} disabled={filterLoading}>
                                <SelectTrigger className="w-[130px] h-8"><SelectValue placeholder="Mês" /></SelectTrigger>
                                <SelectContent>
                                    {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                                        <SelectItem key={m} value={m.toString()}>{new Date(0, m-1).toLocaleString('pt-BR', {month: 'long'})}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={filterYear} onValueChange={(v) => handleFilterChange('year', v)} disabled={filterLoading}>
                                <SelectTrigger className="w-[90px] h-8"><SelectValue placeholder="Ano" /></SelectTrigger>
                                <SelectContent>
                                    {[2024, 2025, 2026].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-end gap-2 mb-4">
                            <span className={`text-4xl font-bold ${creditData?.creditsBalance && creditData.creditsBalance < 100 ? 'text-red-500' : 'text-primary'}`}>
                                {creditData?.creditsBalance?.toLocaleString() || 0}
                            </span>
                            <span className="text-muted-foreground mb-1">disponíveis</span>
                        </div>
                        
                        <Progress value={creditData?.totalCredits ? (creditData.creditsSpent / creditData.totalCredits) * 100 : 0} className="h-3 mb-6" />
                        
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Limite do Plano:</span>
                                <span className="font-medium">{creditData?.planLimit?.toLocaleString() || 0}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Créditos Avulsos:</span>
                                <span className="font-medium text-green-600">+{creditData?.extraCredits?.toLocaleString() || 0}</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t">
                                <span className="text-muted-foreground">Consumo ({filterMonth}/{filterYear}):</span>
                                <span className="font-medium text-red-500">-{creditData?.creditsSpent?.toLocaleString() || 0}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* CARD DE RECARGA */}
                <Card className="border-primary/20 bg-primary/5 flex flex-col justify-between">
                    <CardHeader>
                        <CardTitle>Recarga Avulsa</CardTitle>
                        <CardDescription>Precisa de mais? Adicione créditos instantâneos.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-lg font-semibold">{selectedCredits.toLocaleString()} créditos</span>
                                <span className="text-xl font-bold text-primary">R$ {((selectedCredits/500)*40).toFixed(2)}</span>
                            </div>
                            <Slider value={[selectedCredits]} onValueChange={(v) => setSelectedCredits(v[0])} min={500} max={5000} step={500} />
                        </div>
                        
                        <Button className="w-full" size="lg" onClick={() => handleRedirectPayment('credits', selectedCredits)} disabled={processing === 'credits'}>
                            {processing === 'credits' ? <Loader2 className="animate-spin mr-2"/> : <Zap className="w-4 h-4 mr-2"/>}
                            Pagar com Pix ou Cartão
                        </Button>
                        
                        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                            <ShieldCheck className="w-3 h-3"/> Checkout seguro via Asaas
                        </div>
                    </CardContent>
                </Card>
            </div>
        </TabsContent>

        <TabsContent value="plans">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {planos.map((p) => (
                    <Card key={p.id} className={`flex flex-col relative transition-all duration-200 ${p.popular ? 'border-primary shadow-xl scale-105 z-10' : 'hover:border-primary/50'}`}>
                        {p.popular && (
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                                MAIS POPULAR
                            </div>
                        )}
                        {p.badge && (
                            <div className="absolute top-0 right-0 bg-secondary text-secondary-foreground text-xs font-bold px-2 py-1 rounded-bl">
                                {p.badge}
                            </div>
                        )}
                        
                        <CardHeader>
                            <CardTitle className="text-xl">{p.name}</CardTitle>
                            <CardDescription>{p.description}</CardDescription>
                            <div className="mt-4">
                                <span className="text-3xl font-bold">R$ {p.price}</span>
                                <span className="text-muted-foreground">/mês</span>
                            </div>
                        </CardHeader>
                        
                        <CardContent className="flex-1">
                            <ul className="space-y-3">
                                {p.features.map((feat, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm">
                                        {feat.included ? (
                                            <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0"/>
                                        ) : (
                                            <X className="w-4 h-4 text-muted-foreground/40 mt-0.5 shrink-0"/>
                                        )}
                                        <span className={feat.included ? "text-foreground" : "text-muted-foreground/60"}>
                                            {feat.text}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                        
                        <CardFooter>
                            <Button 
                                className="w-full" 
                                variant={p.popular ? "default" : "outline"} 
                                onClick={() => handleRedirectPayment('plan', p.id)} 
                                disabled={!!processing}
                            >
                                {processing === p.id.toString() ? <Loader2 className="animate-spin mr-2 w-4 h-4"/> : null}
                                {processing === p.id.toString() ? 'Redirecionando...' : 'Assinar Agora'}
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </TabsContent>

        <TabsContent value="history">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5"/> Pagamentos Recentes</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
                            <TableBody>
                                {transacoes.map((t) => (
                                    <TableRow key={t.id}>
                                        <TableCell>{t.data_pagamento ? new Date(t.data_pagamento).toLocaleDateString() : new Date(t.data_transacao).toLocaleDateString()}</TableCell>
                                        <TableCell className="max-w-[150px] truncate" title={t.descricao}>{t.descricao}</TableCell>
                                        <TableCell>R$ {t.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell><Badge variant={t.status === 'pago' ? 'default' : 'secondary'}>{t.status}</Badge></TableCell>
                                        <TableCell>
                                            {t.invoice_url && <a href={t.invoice_url} target="_blank" className="text-primary hover:underline flex items-center gap-1"><ExternalLink className="w-3 h-3"/></a>}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {transacoes.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma transação encontrada.</TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5"/> Histórico de Consumo</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader><TableRow><TableHead>Mês/Ano</TableHead><TableHead className="text-right">Créditos Usados</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {historicoConsumo.map((h) => (
                                    <TableRow key={h.periodo}>
                                        <TableCell className="font-medium">{h.periodo}</TableCell>
                                        <TableCell className="text-right font-bold">{h.creditos_utilizados.toLocaleString()}</TableCell>
                                    </TableRow>
                                ))}
                                {historicoConsumo.length === 0 && <TableRow><TableCell colSpan={2} className="text-center py-8 text-muted-foreground">Sem dados de consumo.</TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Billing;
