import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, TrendingUp, Loader2, RefreshCcw, MessageCircle, CreditCard, QrCode, Copy, Users, History, FileText, CheckCircle2, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CreditData {
  creditsSpent: number;
  creditsBalance: number;
  totalCredits?: number;
  planLimit?: number;
  extraCredits?: number;
  planName?: string;
  periodo: string;
}

interface Plano {
  id: number;
  nome: string;
  preco_mensal: number;
  limite_creditos: number;
  limite_usuarios: number | null;
  funcionalidades: string[];
}

interface Transacao {
  id: string;
  tipo: string;
  valor: number;
  status: string;
  descricao: string;
  data_transacao: string;
}

interface HistoricoConsumo {
  periodo: string;
  creditos_utilizados: number;
}

const Billing = () => {
  const [creditData, setCreditData] = useState<CreditData | null>(null);
  const [plano, setPlano] = useState<Plano | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCredits, setSelectedCredits] = useState<number>(1000);
  const [paymentMethod, setPaymentMethod] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [processing, setProcessing] = useState(false);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [historicoConsumo, setHistoricoConsumo] = useState<HistoricoConsumo[]>([]);
  
  // Filtro de Data
  const currentDate = new Date();
  const [filterMonth, setFilterMonth] = useState<string>((currentDate.getMonth() + 1).toString());
  const [filterYear, setFilterYear] = useState<string>(currentDate.getFullYear().toString());

  // Dialogs
  const [pixDialogOpen, setPixDialogOpen] = useState(false);
  const [pixData, setPixData] = useState<{ qrCode: string; copyPaste: string } | null>(null);
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [cardData, setCardData] = useState({ holderName: "", number: "", expiryMonth: "", expiryYear: "", ccv: "" });
  const [pendingAction, setPendingAction] = useState<{ type: 'buy_credits' | 'upgrade_plan', payload: any } | null>(null);

  const { toast } = useToast();

  const [filterLoading, setFilterLoading] = useState(false);

  const fetchCredits = async (month?: string, year?: string) => {
    try {
      setLoading(true);
      setFilterLoading(true);
      
      const m = month || filterMonth;
      const y = year || filterYear;

      // 1. Créditos (Passando data para API)
      const { data: creditResponse, error: creditError } = await supabase.functions.invoke('fetch-gpt-credits', {
        body: { month: m, year: y }
      });
      
      if (creditError) throw creditError;
      setCreditData(creditResponse);

      // 2. Perfil e Plano
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('equipe_id')
        .eq('user_id', user.id)
        .single();

      if (profile?.equipe_id) {
        const { data: equipe } = await supabase
          .from('equipes')
          .select('plano_id, creditos_avulsos, planos(*)')
          .eq('id', profile.equipe_id)
          .single();

        if (equipe?.planos) {
          setPlano(equipe.planos as unknown as Plano);
        }

        // 3. Histórico
        const { data: txData } = await supabase
          .from('transacoes')
          .select('*')
          .eq('equipe_id', profile.equipe_id)
          .order('data_transacao', { ascending: false })
          .limit(10);
        if (txData) setTransacoes(txData);

        const { data: consData } = await supabase
          .from('consumo_creditos')
          .select('*')
          .eq('equipe_id', profile.equipe_id)
          .order('periodo', { ascending: false })
          .limit(12);
        if (consData) setHistoricoConsumo(consData);
      }
    } catch (error: any) {
      console.error('Error fetching billing data:', error);
    } finally {
      setLoading(false);
      setFilterLoading(false);
    }
  };

  const handleFilterChange = (type: 'month' | 'year', value: string) => {
    if (type === 'month') {
      setFilterMonth(value);
      fetchCredits(value, filterYear);
    } else {
      setFilterYear(value);
      fetchCredits(filterMonth, value);
    }
  };

  const handleRecharge = () => {
    const totalCost = (selectedCredits / 500) * 40;
    const message = `Gostaria de recarregar ${selectedCredits.toLocaleString()} créditos (R$ ${totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`;
    window.open(`https://wa.me/5585996487923?text=${encodeURIComponent(message)}`, '_blank');
  };

  const initiatePurchase = () => {
    const action = { type: 'buy_credits' as const, payload: { credits: selectedCredits } };
    if (paymentMethod === 'CREDIT_CARD') {
      setPendingAction(action);
      setCardDialogOpen(true);
    } else {
      handlePixPurchase(action);
    }
  };

  const initiatePlanUpgrade = (planoId: number) => {
    setPendingAction({ type: 'upgrade_plan', payload: { planoId } });
    setCardDialogOpen(true); 
  };

  const handlePixPurchase = async (action: any) => {
    setProcessing(true);
    try {
      const totalCost = (action.payload.credits / 500) * 40;
      const { data, error } = await supabase.functions.invoke('asaas-buy-credits', {
        body: { amount: totalCost, paymentMethod: 'PIX', credits: action.payload.credits }
      });
      if (error) throw error;
      if (data.pixQrCode) {
        setPixData({ qrCode: data.pixQrCode, copyPaste: data.pixCopyPaste });
        setPixDialogOpen(true);
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const tokenizeCard = async () => {
    const { data, error } = await supabase.functions.invoke('asaas-tokenize', {
      body: {
        creditCard: {
          holderName: cardData.holderName,
          number: cardData.number.replace(/\s/g, ''),
          expiryMonth: cardData.expiryMonth,
          expiryYear: cardData.expiryYear,
          ccv: cardData.ccv
        },
        creditCardHolderInfo: {
            name: cardData.holderName,
            email: "financeiro@cliente.com", 
            cpfCnpj: "00000000000",
            postalCode: "00000000",
            addressNumber: "0",
            phone: "00000000000"
        }
      }
    });
    if (error || !data.creditCardToken) throw new Error(data?.error || "Erro ao processar cartão");
    return data.creditCardToken;
  };

  const handleCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    try {
      const token = await tokenizeCard();
      if (pendingAction?.type === 'buy_credits') {
        const totalCost = (pendingAction.payload.credits / 500) * 40;
        await supabase.functions.invoke('asaas-buy-credits', {
          body: { amount: totalCost, paymentMethod: 'CREDIT_CARD', credits: pendingAction.payload.credits, creditCardToken: token }
        });
        toast({ title: "Sucesso!", description: "Créditos comprados." });
      } else if (pendingAction?.type === 'upgrade_plan') {
        await supabase.functions.invoke('asaas-subscribe', {
          body: { plano_id: pendingAction.payload.planoId, creditCardToken: token }
        });
        toast({ title: "Sucesso!", description: "Assinatura configurada." });
      }
      setCardDialogOpen(false);
      fetchCredits();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
      setPendingAction(null);
    }
  };

  useEffect(() => { fetchCredits(); }, []);

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const totalCredits = creditData?.totalCredits || 1000;
  const usagePercentage = totalCredits > 0 ? ((creditData?.creditsSpent || 0) / totalCredits) * 100 : 0;

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-border bg-header-bg">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-foreground">
            Billing <span className="text-primary">&amp; Créditos</span>
          </h1>
          <p className="text-sm text-foreground/70 mt-1 font-medium">
            Gerencie seu consumo e plano AdvAI
          </p>
        </div>
      </div>

      <div className="flex-1 container mx-auto px-4 py-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            
            {/* PLANO ATUAL */}
            {plano && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div><CardTitle>Plano Atual</CardTitle><CardDescription>Sua assinatura ativa</CardDescription></div>
                    <Badge variant="secondary" className="text-lg px-4 py-1">{plano.nome}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div><p className="text-sm text-muted-foreground">Valor Mensal</p><p className="text-2xl font-bold">R$ {plano.preco_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
                    <div><p className="text-sm text-muted-foreground">Limite de Créditos</p><p className="text-2xl font-bold">{plano.limite_creditos.toLocaleString()}</p></div>
                    <div><p className="text-sm text-muted-foreground">Usuários</p><p className="text-2xl font-bold">{plano.limite_usuarios || 'Ilimitado'}</p></div>
                  </div>
                  <div className="border-t pt-4">
                    <p className="text-sm font-semibold mb-2">Funcionalidades:</p>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {plano.funcionalidades?.map((func, index) => (
                        <li key={index} className="text-sm text-muted-foreground flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" />{func}</li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* SELETOR DE MÊS (Para conferir o consumo 788 vs 1108) */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="w-5 h-5"/>
                Consumo de Créditos
                {filterLoading && <Loader2 className="w-4 h-4 animate-spin text-primary ml-2" />}
              </h2>
              <div className="flex gap-2">
                <Select value={filterMonth} onValueChange={(v) => handleFilterChange('month', v)} disabled={filterLoading}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Mês" /></SelectTrigger>
                  <SelectContent>
                    {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                      <SelectItem key={m} value={m.toString()}>{new Date(0, m-1).toLocaleString('pt-BR', {month: 'long'})}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterYear} onValueChange={(v) => handleFilterChange('year', v)} disabled={filterLoading}>
                  <SelectTrigger className="w-[100px]"><SelectValue placeholder="Ano" /></SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={() => fetchCredits()} variant="ghost" size="icon" disabled={filterLoading}>
                  <RefreshCcw className={`h-4 w-4 ${filterLoading ? 'animate-spin' : ''}`}/>
                </Button>
              </div>
            </div>

            {/* MÉTRICAS DE CONSUMO */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Limite Plano</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{creditData?.planLimit || 0}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Créditos Avulsos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{creditData?.extraCredits || 0}</div></CardContent></Card>
              <Card className="border-primary/50 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Utilizado em {new Date(0, parseInt(filterMonth) - 1).toLocaleString('pt-BR', {month: 'short'})}/{filterYear}
                  </CardTitle>
                </CardHeader>
                <CardContent><div className="text-2xl font-bold text-primary">{creditData?.creditsSpent || 0}</div></CardContent>
              </Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Saldo Disponível</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{creditData?.creditsBalance || 0}</div></CardContent></Card>
            </div>

            {/* PROGRESSO */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Utilizado</span><span className="font-medium">{creditData?.creditsSpent || 0} / {totalCredits}</span></div>
                  <Progress value={usagePercentage} className="h-3" />
                </div>
              </CardContent>
            </Card>

            {/* RECARGA */}
            <Card>
              <CardHeader><CardTitle>Recarga de Créditos</CardTitle><CardDescription>Adicione créditos extras</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex justify-between"><label className="text-sm font-medium">Quantidade</label><span className="text-2xl font-bold text-primary">{selectedCredits.toLocaleString()}</span></div>
                  <Slider value={[selectedCredits]} onValueChange={(v) => setSelectedCredits(v[0])} min={500} max={10000} step={500} />
                </div>
                <div className="space-y-4">
                  <Label>Pagamento</Label>
                  <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)} className="grid grid-cols-2 gap-4">
                    <div className={`flex items-center space-x-2 border rounded-lg p-3 cursor-pointer ${paymentMethod === 'PIX' ? 'border-primary bg-primary/5' : ''}`}>
                      <RadioGroupItem value="PIX" id="pix" /><Label htmlFor="pix" className="flex items-center gap-2 cursor-pointer"><QrCode className="h-4 w-4"/> Pix</Label>
                    </div>
                    <div className={`flex items-center space-x-2 border rounded-lg p-3 cursor-pointer ${paymentMethod === 'CREDIT_CARD' ? 'border-primary bg-primary/5' : ''}`}>
                      <RadioGroupItem value="CREDIT_CARD" id="card" /><Label htmlFor="card" className="flex items-center gap-2 cursor-pointer"><CreditCard className="h-4 w-4"/> Cartão</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="border-t pt-4 flex justify-between items-center">
                  <div><span className="text-sm text-muted-foreground">Total</span><p className="text-2xl font-bold">R$ {((selectedCredits / 500) * 40).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleRecharge}><MessageCircle className="h-4 w-4 mr-2"/> WhatsApp</Button>
                    <Button onClick={initiatePurchase} disabled={processing}>{processing ? <Loader2 className="animate-spin" /> : 'Comprar Agora'}</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* PLANOS - Tabela Comparativa Profissional */}
            <div className="space-y-6 pt-8 border-t">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold tracking-tight">Escolha seu Plano</h2>
                <p className="text-muted-foreground mt-2">Planos flexíveis para cada estágio do seu negócio jurídico</p>
              </div>
              
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="w-[280px] py-6 pl-6">
                        <span className="text-base font-semibold text-foreground">Recursos</span>
                      </TableHead>
                      <TableHead className="text-center py-6 min-w-[180px]">
                        <div className="space-y-1">
                          <div className="text-base font-semibold text-foreground">Solo Starter</div>
                          <div className="text-2xl font-bold text-foreground">R$ 200<span className="text-sm font-normal text-muted-foreground">/mês</span></div>
                        </div>
                      </TableHead>
                      <TableHead className="text-center py-6 min-w-[180px] bg-primary/5 relative">
                        <Badge className="absolute -top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground">
                          Mais Popular
                        </Badge>
                        <div className="space-y-1">
                          <div className="text-base font-semibold text-primary">Solo Scale</div>
                          <div className="text-2xl font-bold text-primary">R$ 400<span className="text-sm font-normal text-muted-foreground">/mês</span></div>
                        </div>
                      </TableHead>
                      <TableHead className="text-center py-6 min-w-[180px]">
                        <div className="space-y-1">
                          <div className="text-base font-semibold text-foreground">Solo Pro</div>
                          <div className="text-2xl font-bold text-foreground">R$ 1.000<span className="text-sm font-normal text-muted-foreground">/mês</span></div>
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Créditos */}
                    <TableRow>
                      <TableCell className="font-medium pl-6">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-primary" />
                          Créditos AdvAI por mês
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-semibold">1.000</TableCell>
                      <TableCell className="text-center font-semibold bg-primary/5">3.000</TableCell>
                      <TableCell className="text-center font-semibold">10.000</TableCell>
                    </TableRow>
                    
                    {/* Usuários */}
                    <TableRow>
                      <TableCell className="font-medium pl-6">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-primary" />
                          Usuários inclusos
                        </div>
                      </TableCell>
                      <TableCell className="text-center">até 3</TableCell>
                      <TableCell className="text-center bg-primary/5">até 5</TableCell>
                      <TableCell className="text-center font-semibold text-primary">Ilimitado</TableCell>
                    </TableRow>
                    
                    {/* Setup Agente */}
                    <TableRow>
                      <TableCell className="font-medium pl-6">Setup completo do Agente IA</TableCell>
                      <TableCell className="text-center"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></TableCell>
                      <TableCell className="text-center bg-primary/5"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></TableCell>
                      <TableCell className="text-center"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></TableCell>
                    </TableRow>
                    
                    {/* Central de Atendimento */}
                    <TableRow>
                      <TableCell className="font-medium pl-6">Central de Atendimento (Chat IA)</TableCell>
                      <TableCell className="text-center"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></TableCell>
                      <TableCell className="text-center bg-primary/5"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></TableCell>
                      <TableCell className="text-center"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></TableCell>
                    </TableRow>
                    
                    {/* Dashboard KPIs */}
                    <TableRow>
                      <TableCell className="font-medium pl-6">Dashboard com KPIs em tempo real</TableCell>
                      <TableCell className="text-center text-muted-foreground">—</TableCell>
                      <TableCell className="text-center bg-primary/5"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></TableCell>
                      <TableCell className="text-center"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></TableCell>
                    </TableRow>
                    
                    {/* Pipeline Comercial */}
                    <TableRow>
                      <TableCell className="font-medium pl-6">Pipeline Comercial (CRM integrado)</TableCell>
                      <TableCell className="text-center text-muted-foreground">—</TableCell>
                      <TableCell className="text-center bg-primary/5"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></TableCell>
                      <TableCell className="text-center"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></TableCell>
                    </TableRow>
                    
                    {/* Gestão de Billing */}
                    <TableRow>
                      <TableCell className="font-medium pl-6">Gestão de Billing & Créditos</TableCell>
                      <TableCell className="text-center text-muted-foreground">—</TableCell>
                      <TableCell className="text-center bg-primary/5"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></TableCell>
                      <TableCell className="text-center"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></TableCell>
                    </TableRow>
                    
                    {/* Consultoria */}
                    <TableRow>
                      <TableCell className="font-medium pl-6">Consultoria mensal com especialista</TableCell>
                      <TableCell className="text-center text-muted-foreground">—</TableCell>
                      <TableCell className="text-center bg-primary/5 text-muted-foreground">—</TableCell>
                      <TableCell className="text-center"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></TableCell>
                    </TableRow>
                    
                    {/* API Integrações */}
                    <TableRow>
                      <TableCell className="font-medium pl-6">Integrações avançadas via API</TableCell>
                      <TableCell className="text-center text-muted-foreground">—</TableCell>
                      <TableCell className="text-center bg-primary/5 text-muted-foreground">—</TableCell>
                      <TableCell className="text-center"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></TableCell>
                    </TableRow>
                    
                    {/* Suporte */}
                    <TableRow>
                      <TableCell className="font-medium pl-6">Nível de Suporte</TableCell>
                      <TableCell className="text-center text-sm">WhatsApp</TableCell>
                      <TableCell className="text-center bg-primary/5 text-sm font-medium">Prioritário (SLA 4h)</TableCell>
                      <TableCell className="text-center text-sm font-semibold text-primary">Premium + SLA 99.5%</TableCell>
                    </TableRow>
                    
                    {/* Builder Mode */}
                    <TableRow>
                      <TableCell className="font-medium pl-6">Suporte Builder Mode</TableCell>
                      <TableCell className="text-center text-muted-foreground">—</TableCell>
                      <TableCell className="text-center bg-primary/5">Incluso</TableCell>
                      <TableCell className="text-center font-medium text-primary">Prioritário</TableCell>
                    </TableRow>
                    
                    {/* Botões de Ação */}
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell className="pl-6 py-6">
                        <span className="text-sm text-muted-foreground">Selecione o plano ideal para você</span>
                      </TableCell>
                      <TableCell className="text-center py-6">
                        <Button variant="outline" onClick={() => initiatePlanUpgrade(1)} className="w-full max-w-[140px]">
                          Selecionar
                        </Button>
                      </TableCell>
                      <TableCell className="text-center py-6 bg-primary/5">
                        <Button onClick={() => initiatePlanUpgrade(2)} className="w-full max-w-[140px]">
                          Selecionar
                        </Button>
                      </TableCell>
                      <TableCell className="text-center py-6">
                        <Button variant="outline" onClick={() => initiatePlanUpgrade(3)} className="w-full max-w-[140px]">
                          Selecionar
                        </Button>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Card>
            </div>
          </TabsContent>

          {/* ABA DE HISTÓRICO */}
          <TabsContent value="history" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5"/> Pagamentos</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {transacoes.length === 0 ? <div className="p-8 text-center text-muted-foreground">Sem transações.</div> : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {transacoes.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell>{new Date(t.data_transacao).toLocaleDateString()}</TableCell>
                            <TableCell>R$ {t.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell><Badge variant="outline">{t.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5"/> Consumo Histórico</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {historicoConsumo.length === 0 ? <div className="p-8 text-center text-muted-foreground">Sem dados.</div> : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Período</TableHead><TableHead className="text-right">Utilizado</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {historicoConsumo.map((h) => (
                          <TableRow key={h.periodo}>
                            <TableCell className="font-medium">{h.periodo}</TableCell>
                            <TableCell className="text-right">{h.creditos_utilizados}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <Dialog open={pixDialogOpen} onOpenChange={setPixDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Pagamento via PIX</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {pixData?.qrCode && <img src={`data:image/png;base64,${pixData.qrCode}`} className="w-48 h-48" />}
            <div className="flex gap-2 w-full"><Input value={pixData?.copyPaste} readOnly /><Button onClick={() => navigator.clipboard.writeText(pixData?.copyPaste || "")}><Copy className="h-4 w-4"/></Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cardDialogOpen} onOpenChange={setCardDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Cartão de Crédito</DialogTitle><DialogDescription>Pagamento Seguro</DialogDescription></DialogHeader>
          <form onSubmit={handleCardSubmit} className="space-y-4">
            <Input placeholder="Nome no Cartão" value={cardData.holderName} onChange={e => setCardData({...cardData, holderName: e.target.value})} required />
            <Input placeholder="Número" value={cardData.number} onChange={e => setCardData({...cardData, number: e.target.value})} required />
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="MM" maxLength={2} value={cardData.expiryMonth} onChange={e => setCardData({...cardData, expiryMonth: e.target.value})} required />
              <Input placeholder="AAAA" maxLength={4} value={cardData.expiryYear} onChange={e => setCardData({...cardData, expiryYear: e.target.value})} required />
              <Input placeholder="CVV" maxLength={4} value={cardData.ccv} onChange={e => setCardData({...cardData, ccv: e.target.value})} required />
            </div>
            <DialogFooter><Button type="submit" disabled={processing} className="w-full">{processing ? <Loader2 className="animate-spin" /> : 'Confirmar Pagamento'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Billing;
