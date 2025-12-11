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
import { 
  Zap, Loader2, CheckCircle2, AlertTriangle, ExternalLink, ShieldCheck, X, 
  Crown, Rocket, Building2, TrendingUp, CreditCard, Sparkles, Receipt
} from "lucide-react";
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
  invoice_url?: string; 
}

const planos = [
  { 
    id: 1, 
    name: "Solo Starter", 
    price: 200, 
    credits: 1000,
    users: 3,
    icon: Rocket,
    color: "from-blue-500 to-cyan-500",
    description: "Ideal para pequenos escritórios iniciando na automação",
    features: [
      { text: "1.000 créditos AdvAI/mês", included: true },
      { text: "Até 3 usuários", included: true },
      { text: "Suporte por email", included: true },
      { text: "Dashboard básico", included: true },
      { text: "Relatórios avançados", included: false },
      { text: "API personalizada", included: false },
    ]
  },
  { 
    id: 2, 
    name: "Solo Scale", 
    price: 400, 
    credits: 3000,
    users: 5,
    popular: true,
    icon: TrendingUp,
    color: "from-primary to-orange-400",
    description: "Para equipes em crescimento que precisam de mais poder",
    features: [
      { text: "3.000 créditos AdvAI/mês", included: true },
      { text: "Até 5 usuários", included: true },
      { text: "Suporte prioritário", included: true },
      { text: "Dashboard completo", included: true },
      { text: "Relatórios avançados", included: true },
      { text: "API personalizada", included: false },
    ]
  },
  { 
    id: 3, 
    name: "Solo Pro", 
    price: 1000, 
    credits: 10000,
    users: -1,
    icon: Crown,
    color: "from-violet-500 to-purple-600",
    description: "Solução completa para operações de alta demanda",
    features: [
      { text: "10.000 créditos AdvAI/mês", included: true },
      { text: "Usuários ilimitados", included: true },
      { text: "Suporte VIP 24/7", included: true },
      { text: "Dashboard premium", included: true },
      { text: "Relatórios avançados", included: true },
      { text: "API personalizada", included: true },
    ]
  }
];

const creditPackages = [
  { credits: 500, price: 40, popular: false },
  { credits: 1000, price: 80, popular: true },
  { credits: 2000, price: 150, popular: false },
  { credits: 5000, price: 350, popular: false },
];

const Billing = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [creditData, setCreditData] = useState<CreditData | null>(null);
  const [statusAssinatura, setStatusAssinatura] = useState<string>('active');
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedCredits, setSelectedCredits] = useState<number>(1000);
  
  const currentDate = new Date();
  const [filterMonth, setFilterMonth] = useState<string>((currentDate.getMonth() + 1).toString());
  const [filterYear, setFilterYear] = useState<string>(currentDate.getFullYear().toString());
  const [filterLoading, setFilterLoading] = useState(false);

  const fetchCredits = async (month?: string, year?: string) => {
    try {
      setFilterLoading(true);
      const m = month || filterMonth;
      const y = year || filterYear;

      const { data: creds, error } = await supabase.functions.invoke('fetch-gpt-credits', { body: { month: m, year: y } });
      if (!error && creds) setCreditData(creds);

      if (user) {
        const { data: profile } = await supabase.from('profiles').select('equipe_id').eq('user_id', user.id).single();
        if (profile?.equipe_id) {
          const { data: equipe } = await supabase.from('equipes').select('subscription_status').eq('id', profile.equipe_id).single();
          if (equipe) setStatusAssinatura(equipe.subscription_status || 'active');

          const { data: txs } = await supabase.from('transacoes').select('*').eq('equipe_id', profile.equipe_id).order('data_transacao', { ascending: false }).limit(20);
          if (txs) setTransacoes(txs);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setFilterLoading(false);
    }
  };

  useEffect(() => { if(user) fetchCredits(); }, [user]);

  const handleFilterChange = (type: 'month' | 'year', value: string) => {
    if (type === 'month') { setFilterMonth(value); fetchCredits(value, filterYear); } 
    else { setFilterYear(value); fetchCredits(filterMonth, value); }
  };

  const handleRedirectPayment = async (type: 'credits' | 'plan', value: number) => {
    const loadingKey = type === 'plan' ? `plan_${value}` : 'credits';
    setProcessing(loadingKey);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Sessão expirada", description: "Faça login novamente.", variant: "destructive" });
        return;
      }

      toast({ title: "Gerando link seguro...", description: "Aguarde enquanto preparamos seu pagamento." });

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
        throw new Error(data?.error || error?.message || "Link de pagamento não encontrado.");
      }

      // Abre em nova aba (funciona no iframe)
      const newWindow = window.open(data.invoiceUrl, '_blank');
      
      if (!newWindow) {
        toast({
          title: "Link gerado com sucesso!",
          description: "Clique abaixo para acessar o pagamento.",
          action: (
            <Button size="sm" variant="outline" onClick={() => window.open(data.invoiceUrl, '_blank')}>
              <ExternalLink className="w-4 h-4 mr-2" /> Abrir
            </Button>
          ),
          duration: 30000,
        });
      } else {
        toast({ title: "Sucesso!", description: "Página de pagamento aberta em nova aba." });
      }

    } catch (error: any) {
      toast({ title: "Erro no processamento", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const usagePercentage = creditData?.totalCredits ? (creditData.creditsSpent / creditData.totalCredits) * 100 : 0;
  const selectedPrice = (selectedCredits / 500) * 40;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto"/>
          <p className="text-muted-foreground">Carregando informações...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 md:p-8 space-y-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
            Billing & Créditos
          </h1>
          <p className="text-muted-foreground mt-1">Gerencie sua assinatura e consumo de créditos AdvAI</p>
        </div>
        <Badge 
          variant={statusAssinatura === 'active' ? 'default' : 'destructive'} 
          className={`h-9 px-4 text-sm font-medium ${statusAssinatura === 'active' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}`}
        >
          <div className={`w-2 h-2 rounded-full mr-2 ${statusAssinatura === 'active' ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}/>
          {statusAssinatura === 'active' ? 'Assinatura Ativa' : 'Pagamento Pendente'}
        </Badge>
      </div>

      {statusAssinatura !== 'active' && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
          <AlertTriangle className="h-5 w-5"/>
          <AlertTitle className="font-semibold">Atenção: Pagamento Pendente</AlertTitle>
          <AlertDescription>Regularize sua assinatura para continuar utilizando todos os recursos.</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-md bg-muted/50 p-1">
          <TabsTrigger value="overview" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Sparkles className="w-4 h-4 mr-2"/>Consumo
          </TabsTrigger>
          <TabsTrigger value="plans" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <CreditCard className="w-4 h-4 mr-2"/>Planos
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Receipt className="w-4 h-4 mr-2"/>Histórico
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Credit Balance Card - 3 cols */}
            <Card className="lg:col-span-3 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none"/>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardDescription className="text-sm font-medium">Saldo de Créditos</CardDescription>
                    <CardTitle className="text-4xl md:text-5xl font-bold mt-2 tabular-nums">
                      {creditData?.creditsBalance?.toLocaleString('pt-BR') || 0}
                    </CardTitle>
                    <p className="text-muted-foreground text-sm mt-1">
                      de {creditData?.totalCredits?.toLocaleString('pt-BR') || 0} créditos disponíveis
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Select value={filterMonth} onValueChange={(v) => handleFilterChange('month', v)}>
                      <SelectTrigger className="w-[100px] h-8 text-xs">
                        <SelectValue/>
                      </SelectTrigger>
                      <SelectContent>
                        {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m,i) => (
                          <SelectItem key={i+1} value={(i+1).toString()}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filterYear} onValueChange={(v) => handleFilterChange('year', v)}>
                      <SelectTrigger className="w-[80px] h-8 text-xs">
                        <SelectValue/>
                      </SelectTrigger>
                      <SelectContent>
                        {[2024,2025,2026].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {filterLoading && <Loader2 className="animate-spin w-4 h-4 text-muted-foreground"/>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Consumido este mês</span>
                    <span className="font-medium">{usagePercentage.toFixed(1)}%</span>
                  </div>
                  <div className="h-4 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        usagePercentage > 80 ? 'bg-gradient-to-r from-red-500 to-orange-500' :
                        usagePercentage > 50 ? 'bg-gradient-to-r from-yellow-500 to-orange-500' :
                        'bg-gradient-to-r from-green-500 to-emerald-500'
                      }`}
                      style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Credit Breakdown */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-muted/50 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-foreground">{creditData?.planLimit?.toLocaleString('pt-BR') || 0}</div>
                    <div className="text-xs text-muted-foreground mt-1">Créditos do Plano</div>
                  </div>
                  <div className="bg-primary/10 rounded-xl p-4 text-center border border-primary/20">
                    <div className="text-2xl font-bold text-primary">+{creditData?.extraCredits?.toLocaleString('pt-BR') || 0}</div>
                    <div className="text-xs text-muted-foreground mt-1">Créditos Avulsos</div>
                  </div>
                  <div className="bg-red-500/10 rounded-xl p-4 text-center border border-red-500/20">
                    <div className="text-2xl font-bold text-red-500">-{creditData?.creditsSpent?.toLocaleString('pt-BR') || 0}</div>
                    <div className="text-xs text-muted-foreground mt-1">Consumidos</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recharge Card - 2 cols */}
            <Card className="lg:col-span-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Zap className="w-5 h-5 text-primary"/>
                  </div>
                  <div>
                    <CardTitle className="text-lg">Recarga Rápida</CardTitle>
                    <CardDescription>Adicione créditos instantaneamente</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center py-4 bg-background/50 rounded-xl border">
                  <div className="text-4xl font-bold text-foreground">{selectedCredits.toLocaleString('pt-BR')}</div>
                  <div className="text-sm text-muted-foreground">créditos</div>
                  <div className="text-2xl font-semibold text-primary mt-2">
                    R$ {selectedPrice.toFixed(2).replace('.', ',')}
                  </div>
                </div>
                
                <div className="space-y-3">
                  <Slider 
                    value={[selectedCredits]} 
                    onValueChange={(v) => setSelectedCredits(v[0])} 
                    min={500} 
                    max={5000} 
                    step={500}
                    className="py-4"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>500</span>
                    <span>2.500</span>
                    <span>5.000</span>
                  </div>
                </div>

                <Button 
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-orange-500 hover:opacity-90 transition-opacity" 
                  onClick={() => handleRedirectPayment('credits', selectedCredits)} 
                  disabled={processing === 'credits'}
                >
                  {processing === 'credits' ? (
                    <Loader2 className="animate-spin mr-2 h-5 w-5"/>
                  ) : (
                    <CreditCard className="mr-2 h-5 w-5"/>
                  )}
                  Pagar com Pix ou Cartão
                </Button>
                
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="w-4 h-4 text-green-500"/> 
                  Pagamento 100% seguro via Asaas
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* PLANS TAB */}
        <TabsContent value="plans" className="space-y-6">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h2 className="text-2xl font-bold">Escolha o plano ideal para você</h2>
            <p className="text-muted-foreground mt-2">Todos os planos incluem acesso completo ao AdvAI. Escolha baseado na sua necessidade de créditos.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {planos.map((plano) => {
              const Icon = plano.icon;
              const isProcessing = processing === `plan_${plano.id}`;
              
              return (
                <Card 
                  key={plano.id} 
                  className={`relative flex flex-col overflow-hidden transition-all duration-300 hover:shadow-xl ${
                    plano.popular 
                      ? 'border-primary shadow-lg scale-[1.02] md:scale-105' 
                      : 'hover:border-primary/50'
                  }`}
                >
                  {plano.popular && (
                    <div className="absolute top-0 right-0 left-0">
                      <div className="bg-gradient-to-r from-primary to-orange-500 text-primary-foreground text-xs font-bold text-center py-1.5">
                        MAIS POPULAR
                      </div>
                    </div>
                  )}
                  
                  <CardHeader className={plano.popular ? 'pt-10' : ''}>
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plano.color} flex items-center justify-center mb-4`}>
                      <Icon className="w-6 h-6 text-white"/>
                    </div>
                    <CardTitle className="text-xl">{plano.name}</CardTitle>
                    <CardDescription className="text-sm">{plano.description}</CardDescription>
                    <div className="mt-4">
                      <span className="text-4xl font-bold">R$ {plano.price}</span>
                      <span className="text-muted-foreground">/mês</span>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="flex-1">
                    <ul className="space-y-3">
                      {plano.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-3">
                          {feature.included ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5"/>
                          ) : (
                            <X className="w-5 h-5 text-muted-foreground/50 shrink-0 mt-0.5"/>
                          )}
                          <span className={feature.included ? 'text-foreground' : 'text-muted-foreground/50'}>
                            {feature.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  
                  <CardFooter className="pt-4">
                    <Button 
                      className={`w-full h-12 font-semibold ${
                        plano.popular 
                          ? 'bg-gradient-to-r from-primary to-orange-500 hover:opacity-90' 
                          : ''
                      }`}
                      variant={plano.popular ? 'default' : 'outline'}
                      onClick={() => handleRedirectPayment('plan', plano.id)}
                      disabled={!!processing}
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="animate-spin mr-2 h-4 w-4"/>
                          Processando...
                        </>
                      ) : (
                        'Assinar Agora'
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="w-5 h-5"/>
                Histórico de Transações
              </CardTitle>
              <CardDescription>Veja todas as suas transações e faturas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Data</TableHead>
                      <TableHead className="font-semibold">Descrição</TableHead>
                      <TableHead className="font-semibold">Valor</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold text-right">Fatura</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transacoes.map((t) => (
                      <TableRow key={t.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium">
                          {new Date(t.data_transacao).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell>{t.descricao}</TableCell>
                        <TableCell className="font-semibold">
                          R$ {t.valor.toFixed(2).replace('.', ',')}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={t.status === 'pago' ? 'default' : 'secondary'}
                            className={t.status === 'pago' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}
                          >
                            {t.status === 'pago' ? 'Pago' : t.status === 'pendente' ? 'Pendente' : t.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {t.invoice_url && (
                            <a 
                              href={t.invoice_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline text-sm font-medium"
                            >
                              <ExternalLink className="w-4 h-4"/>
                              Ver Fatura
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {transacoes.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                          <Receipt className="w-12 h-12 mx-auto mb-4 opacity-20"/>
                          <p>Nenhuma transação encontrada</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Billing;
