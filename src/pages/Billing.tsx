import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { 
  Zap, Loader2, CreditCard, History, CheckCircle2, AlertTriangle, 
  ExternalLink, Users, X, Sparkles, Crown, Building2, ArrowRight,
  TrendingUp, Wallet
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface CreditData {
  creditsSpent: number;
  creditsBalance: number;
  totalCredits: number;
  planLimit: number;
  extraCredits: number;
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

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  id: number;
  name: string;
  price: string;
  credits: string;
  users: string;
  description: string;
  features: PlanFeature[];
  popular?: boolean;
  badge?: string;
  icon: React.ReactNode;
}

const planos: Plan[] = [
  {
    id: 1,
    name: "Solo Starter",
    price: "200",
    credits: "1.000",
    users: "Até 3",
    description: "Ideal para escritórios iniciando automação",
    icon: <Sparkles className="w-6 h-6" />,
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
    credits: "3.000",
    users: "Até 5",
    description: "Para escritórios em crescimento",
    popular: true,
    icon: <TrendingUp className="w-6 h-6" />,
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
    credits: "10.000",
    users: "Ilimitado",
    description: "Solução enterprise para alta demanda",
    badge: "Enterprise",
    icon: <Crown className="w-6 h-6" />,
    features: [
      { text: "10.000 créditos AdvAI/mês", included: true },
      { text: "Usuários ilimitados", included: true },
      { text: "Setup completo do Agente", included: true },
      { text: "Central de Atendimento", included: true },
      { text: "Suporte 24/7 dedicado", included: true },
      { text: "Pipeline Comercial (CRM)", included: true },
      { text: "Dashboard de KPIs avançado", included: true },
      { text: "Consultoria semanal", included: true },
      { text: "Customizações sob demanda", included: true },
      { text: "SLA garantido", included: true },
    ]
  }
];

const Billing = () => {
  const { user } = useAuth();
  const [creditData, setCreditData] = useState<CreditData | null>(null);
  const [statusAssinatura, setStatusAssinatura] = useState<string>('active');
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedCredits, setSelectedCredits] = useState<number>(1000);
  const { toast } = useToast();

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: creds, error } = await supabase.functions.invoke('fetch-gpt-credits');
      if (!error && creds) setCreditData(creds);

      if (user) {
        const { data: profile } = await supabase.from('profiles').select('equipe_id').eq('user_id', user.id).single();
        if (profile) {
          const { data: equipe } = await supabase.from('equipes').select('subscription_status').eq('id', profile.equipe_id).single();
          if (equipe) setStatusAssinatura(equipe.subscription_status || 'active');

          const { data: txs } = await supabase.from('transacoes').select('*').eq('equipe_id', profile.equipe_id).order('data_transacao', { ascending: false }).limit(10);
          if (txs) setTransacoes(txs);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user]);

  const handlePurchase = async (type: 'credits' | 'plan', value: number) => {
    const id = type === 'credits' ? 'credits' : `plan-${value}`;
    setProcessingId(id);
    
    try {
      if (!user) throw new Error("Sessão inválida. Faça login novamente.");
      
      let body = {};
      let funcName = '';

      if (type === 'credits') {
        const amount = (value / 500) * 40;
        body = { amount, credits: value };
        funcName = 'asaas-buy-credits';
      } else {
        body = { plano_id: value };
        funcName = 'asaas-subscribe';
      }

      const { data, error } = await supabase.functions.invoke(funcName, { body });
      
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      if (data.invoiceUrl) {
        toast({ 
          title: "Redirecionando...", 
          description: "Você será levado ao checkout seguro.",
        });
        window.location.href = data.invoiceUrl;
      } else {
        throw new Error("Link de pagamento não gerado. Tente novamente.");
      }

    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  const usagePercent = creditData?.totalCredits 
    ? Math.min((creditData.creditsSpent / creditData.totalCredits) * 100, 100) 
    : 0;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary"/>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestão Financeira</h1>
          <p className="text-muted-foreground mt-1">Gerencie sua assinatura, créditos e pagamentos</p>
        </div>
        <div>
          {statusAssinatura === 'active' ? (
            <Badge className="bg-green-600/20 text-green-400 border-green-600/30 hover:bg-green-600/30 h-9 px-4 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4 mr-2"/> Assinatura Ativa
            </Badge>
          ) : (
            <Badge variant="destructive" className="h-9 px-4 text-sm font-medium">
              <AlertTriangle className="w-4 h-4 mr-2"/> Pagamento Pendente
            </Badge>
          )}
        </div>
      </div>

      {statusAssinatura !== 'active' && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
          <AlertTriangle className="h-4 w-4"/>
          <AlertTitle>Ação Necessária</AlertTitle>
          <AlertDescription>
            Sua assinatura está pendente. Regularize o pagamento para evitar interrupção dos serviços.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="overview" className="gap-2">
            <Wallet className="w-4 h-4" /> Visão Geral
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-2">
            <CreditCard className="w-4 h-4" /> Planos
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="w-4 h-4" /> Histórico
          </TabsTrigger>
        </TabsList>

        {/* VISÃO GERAL */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card de Saldo Detalhado */}
            <Card className="border-border/50">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Saldo de Créditos</CardTitle>
                  <Zap className="w-5 h-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-4xl font-bold">{creditData?.creditsBalance?.toLocaleString('pt-BR') || 0}</span>
                    <span className="text-muted-foreground">créditos disponíveis</span>
                  </div>
                  <Progress value={usagePercent} className="h-3" />
                  <p className="text-sm text-muted-foreground mt-2">
                    {usagePercent.toFixed(0)}% utilizado este mês
                  </p>
                </div>

                <Separator />

                {/* Breakdown Detalhado */}
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Créditos do Plano</span>
                    <span className="font-medium">{creditData?.planLimit?.toLocaleString('pt-BR') || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Créditos Avulsos</span>
                    <span className="font-medium text-primary">+ {creditData?.extraCredits?.toLocaleString('pt-BR') || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Consumo do Mês</span>
                    <span className="font-medium text-orange-400">- {creditData?.creditsSpent?.toLocaleString('pt-BR') || 0}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Saldo Disponível</span>
                    <span className="text-primary">{creditData?.creditsBalance?.toLocaleString('pt-BR') || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card de Recarga */}
            <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg">Recarga Rápida</CardTitle>
                </div>
                <CardDescription>Compre créditos avulsos quando precisar</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold">{selectedCredits.toLocaleString('pt-BR')} créditos</span>
                  <span className="text-2xl font-bold text-primary">
                    R$ {((selectedCredits / 500) * 40).toFixed(2).replace('.', ',')}
                  </span>
                </div>
                
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
                
                <Button 
                  className="w-full h-12 text-base font-semibold" 
                  onClick={() => handlePurchase('credits', selectedCredits)} 
                  disabled={processingId === 'credits'}
                >
                  {processingId === 'credits' ? (
                    <Loader2 className="animate-spin mr-2 h-5 w-5"/>
                  ) : (
                    <Zap className="w-5 h-5 mr-2"/>
                  )}
                  Comprar Créditos
                </Button>
                
                <p className="text-xs text-center text-muted-foreground">
                  Você será redirecionado para escolher PIX ou Cartão
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* PLANOS */}
        <TabsContent value="plans">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {planos.map((plan) => (
              <Card 
                key={plan.id} 
                className={`flex flex-col relative transition-all duration-300 ${
                  plan.popular 
                    ? 'border-primary shadow-xl shadow-primary/10 scale-[1.02]' 
                    : 'border-border/50 hover:border-border'
                }`}
              >
                {/* Badges */}
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground px-4 py-1 text-xs font-semibold shadow-lg">
                      Mais Popular
                    </Badge>
                  </div>
                )}
                {plan.badge && !plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="secondary" className="px-4 py-1 text-xs font-semibold">
                      {plan.badge}
                    </Badge>
                  </div>
                )}

                <CardHeader className="pt-8">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-lg ${plan.popular ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {plan.icon}
                    </div>
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">R$ {plan.price}</span>
                    <span className="text-muted-foreground">/mês</span>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 space-y-4">
                  {/* Destaques principais */}
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Zap className="w-4 h-4 text-primary"/> 
                    {plan.credits} créditos mensais
                  </div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Users className="w-4 h-4 text-primary"/> 
                    {plan.users} usuários
                  </div>

                  <Separator className="my-4" />

                  {/* Lista de Features */}
                  <div className="space-y-3">
                    {plan.features.slice(2).map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        {feature.included ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0"/>
                        ) : (
                          <X className="w-4 h-4 text-muted-foreground/50 mt-0.5 shrink-0"/>
                        )}
                        <span className={feature.included ? '' : 'text-muted-foreground/50'}>
                          {feature.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>

                <CardFooter className="pt-4">
                  <Button 
                    className={`w-full h-12 font-semibold ${plan.popular ? '' : ''}`}
                    variant={plan.popular ? "default" : "outline"} 
                    onClick={() => handlePurchase('plan', plan.id)} 
                    disabled={processingId === `plan-${plan.id}`}
                  >
                    {processingId === `plan-${plan.id}` ? (
                      <Loader2 className="animate-spin h-5 w-5"/>
                    ) : (
                      <>
                        Assinar Agora
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
          
          <p className="text-center text-sm text-muted-foreground mt-6">
            Você será redirecionado para escolher a forma de pagamento (PIX ou Cartão)
          </p>
        </TabsContent>

        {/* HISTÓRICO */}
        <TabsContent value="history">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Histórico de Transações
              </CardTitle>
              <CardDescription>Suas últimas compras e pagamentos</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Fatura</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transacoes.map((t) => (
                    <TableRow key={t.id} className="border-border/30">
                      <TableCell className="font-medium">
                        {new Date(t.data_transacao).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>{t.descricao || t.tipo}</TableCell>
                      <TableCell>R$ {t.valor.toFixed(2).replace('.', ',')}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={t.status === 'pago' ? 'default' : 'secondary'}
                          className={t.status === 'pago' ? 'bg-green-600/20 text-green-400 border-green-600/30' : ''}
                        >
                          {t.status === 'pago' ? 'Pago' : t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {t.invoice_url && (
                          <a 
                            href={t.invoice_url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-primary hover:underline inline-flex items-center gap-1"
                          >
                            Ver <ExternalLink className="w-3 h-3"/>
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {transacoes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhuma transação encontrada.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Billing;
