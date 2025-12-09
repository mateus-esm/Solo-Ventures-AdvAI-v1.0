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

  const fetchCredits = async (month?: string, year?: string) => {
    try {
      setLoading(true);
      
      const m = month || filterMonth;
      const y = year || filterYear;

      // 1. Créditos (Passando data para API)
      const { data: creditResponse, error: creditError } = await supabase.functions.invoke('fetch-gpt-credits', {
        body: { month: m, year: y } // Envia filtro para o backend
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
              <h2 className="text-lg font-semibold flex items-center gap-2"><TrendingUp className="w-5 h-5"/> Consumo de Créditos</h2>
              <div className="flex gap-2">
                <Select value={filterMonth} onValueChange={(v) => handleFilterChange('month', v)}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Mês" /></SelectTrigger>
                  <SelectContent>
                    {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                      <SelectItem key={m} value={m.toString()}>{new Date(0, m-1).toLocaleString('pt-BR', {month: 'long'})}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterYear} onValueChange={(v) => handleFilterChange('year', v)}>
                  <SelectTrigger className="w-[100px]"><SelectValue placeholder="Ano" /></SelectTrigger>
                  <SelectContent>
                    {[2024, 2025].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={() => fetchCredits()} variant="ghost" size="icon"><RefreshCcw className="h-4 w-4"/></Button>
              </div>
            </div>

            {/* MÉTRICAS DE CONSUMO */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Limite Plano</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{creditData?.planLimit || 0}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Créditos Avulsos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{creditData?.extraCredits || 0}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Utilizado ({creditData?.periodo})</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-primary">{creditData?.creditsSpent || 0}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Disponível</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{creditData?.creditsBalance || 0}</div></CardContent></Card>
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

            {/* PLANOS LISTA */}
            <div className="space-y-4 pt-4 border-t">
              <h2 className="text-2xl font-bold">Mudar de Plano</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                <Card className="border-border hover:border-primary transition-all">
                  <CardHeader><CardTitle>Solo Starter</CardTitle><CardDescription>R$ 150/mês</CardDescription></CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary"/> 1.000 Créditos</li>
                      <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary"/> Até 3 Usuários</li>
                      <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary"/> Setup do Agente</li>
                    </ul>
                    <Button variant="outline" className="w-full mt-4" onClick={() => initiatePlanUpgrade(1)}>Assinar Starter</Button>
                  </CardContent>
                </Card>

                <Card className="border-primary border-2 shadow-lg transform scale-105 z-10">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2"><Badge className="bg-primary text-white">Mais Popular</Badge></div>
                  <CardHeader><CardTitle>Solo Scale</CardTitle><CardDescription>R$ 400/mês</CardDescription></CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary"/> 3.000 Créditos</li>
                      <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary"/> Até 5 Usuários</li>
                      <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary"/> Dashboard Completo</li>
                    </ul>
                    <Button className="w-full mt-4" onClick={() => initiatePlanUpgrade(2)}>Assinar Scale</Button>
                  </CardContent>
                </Card>

                <Card className="border-border hover:border-primary transition-all">
                  <CardHeader><CardTitle>Solo Pro</CardTitle><CardDescription>R$ 1.000/mês</CardDescription></CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary"/> 10.000 Créditos</li>
                      <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary"/> Usuários Ilimitados</li>
                      <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary"/> Consultoria Dev</li>
                    </ul>
                    <Button variant="outline" className="w-full mt-4" onClick={() => initiatePlanUpgrade(3)}>Assinar Pro</Button>
                  </CardContent>
                </Card>

              </div>
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
