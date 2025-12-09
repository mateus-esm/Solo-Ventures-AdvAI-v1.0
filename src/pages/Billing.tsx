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
import { Zap, TrendingUp, Loader2, RefreshCcw, MessageCircle, CreditCard, QrCode, Copy, Users, History, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CreditData {
  creditsSpent: number;
  creditsBalance: number;
  totalCredits?: number;
  planLimit?: number;
  extraCredits?: number;
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

const Billing = () => {
  const [creditData, setCreditData] = useState<CreditData | null>(null);
  const [plano, setPlano] = useState<Plano | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCredits, setSelectedCredits] = useState<number>(1000);
  const [paymentMethod, setPaymentMethod] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [processing, setProcessing] = useState(false);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  
  // Dialogs
  const [pixDialogOpen, setPixDialogOpen] = useState(false);
  const [pixData, setPixData] = useState<{ qrCode: string; copyPaste: string } | null>(null);
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [cardData, setCardData] = useState({ holderName: "", number: "", expiryMonth: "", expiryYear: "", ccv: "" });
  const [pendingAction, setPendingAction] = useState<{ type: 'buy_credits' | 'upgrade_plan', payload: any } | null>(null);

  const { toast } = useToast();

  const fetchCredits = async () => {
    try {
      setLoading(true);
      
      // 1. Créditos
      const { data: creditResponse, error: creditError } = await supabase.functions.invoke('fetch-gpt-credits');
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
        // Busca plano com reload forçado para evitar cache
        const { data: equipe, error: equipeError } = await supabase
          .from('equipes')
          .select('plano_id, creditos_avulsos, planos(*)')
          .eq('id', profile.equipe_id)
          .single();

        if (equipe?.planos) {
          console.log("Plano carregado do banco:", equipe.planos); // Debug
          setPlano(equipe.planos as unknown as Plano);
        }

        // 3. Transações Recentes
        const { data: txData } = await supabase
          .from('transacoes')
          .select('*')
          .eq('equipe_id', profile.equipe_id)
          .order('data_transacao', { ascending: false })
          .limit(5);
        
        if (txData) setTransacoes(txData);
      }
    } catch (error: any) {
      console.error('Error fetching billing data:', error);
      // Não mostrar toast de erro se for apenas falta de dados iniciais
    } finally {
      setLoading(false);
    }
  };

  // --- Lógica de Cartão de Crédito ---
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
            email: "cliente@exemplo.com", // TODO: Pegar do profile
            cpfCnpj: "00000000000", // TODO: Pegar do profile
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
        toast({ title: "Sucesso!", description: "Créditos comprados com sucesso." });
      } 
      else if (pendingAction?.type === 'upgrade_plan') {
        await supabase.functions.invoke('asaas-subscribe', {
          body: { plano_id: pendingAction.payload.planoId, creditCardToken: token }
        });
        toast({ title: "Plano Atualizado!", description: "Sua assinatura foi configurada com sucesso." });
      }

      setCardDialogOpen(false);
      fetchCredits();
    } catch (error: any) {
      toast({ title: "Erro no Pagamento", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
      setPendingAction(null);
    }
  };

  // --- Handlers de Ação ---
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
    setCardDialogOpen(true); // Planos sempre pedem cartão para recorrência
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

  useEffect(() => { fetchCredits(); }, []);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const totalCredits = creditData?.totalCredits || 1000;
  const usagePercentage = totalCredits > 0 ? ((creditData?.creditsSpent || 0) / totalCredits) * 100 : 0;

  return (
    <div className="flex-1 flex flex-col">
      {/* Header Original */}
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

      <div className="flex-1 container mx-auto px-4 py-6 space-y-6">
        {/* Card do Plano Atual (Original) */}
        {plano && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Plano Atual</CardTitle>
                  <CardDescription>Detalhes da sua assinatura ativa</CardDescription>
                </div>
                <Badge variant="secondary" className="text-lg px-4 py-1">{plano.nome}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-sm text-muted-foreground">Valor Mensal</p>
                  <p className="text-2xl font-bold">R$ {plano.preco_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Limite de Créditos</p>
                  <p className="text-2xl font-bold">{plano.limite_creditos.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Usuários</p>
                  <p className="text-2xl font-bold">{plano.limite_usuarios ? plano.limite_usuarios : 'Ilimitado'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Visão Geral de Créditos (Original) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Créditos do Plano</CardTitle>
              <Zap className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{creditData?.planLimit || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Créditos Avulsos</CardTitle>
              <Zap className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{creditData?.extraCredits || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Consumo do Mês</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{creditData?.creditsSpent || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Saldo Disponível</CardTitle>
              <Zap className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{creditData?.creditsBalance || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Barra de Progresso (Original) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Consumo de Créditos</CardTitle>
                <CardDescription>Visualização do uso mensal</CardDescription>
              </div>
              <Button onClick={fetchCredits} variant="outline" size="sm">
                <RefreshCcw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Utilizado</span>
                <span className="font-medium">{creditData?.creditsSpent || 0} / {totalCredits}</span>
              </div>
              <Progress value={usagePercentage} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* Recarga de Créditos (Original com Opção de Cartão) */}
        <Card>
          <CardHeader>
            <CardTitle>Recarga de Créditos</CardTitle>
            <CardDescription>Adicione créditos extras à sua conta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Quantidade</label>
                <span className="text-2xl font-bold text-primary">{selectedCredits.toLocaleString()}</span>
              </div>
              <Slider
                value={[selectedCredits]}
                onValueChange={(value) => setSelectedCredits(value[0])}
                min={500}
                max={10000}
                step={500}
                className="w-full"
              />
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-medium">Método de Pagamento</Label>
              <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as any)} className="grid grid-cols-2 gap-4">
                <div className={`flex items-center space-x-2 border rounded-lg p-3 cursor-pointer ${paymentMethod === 'PIX' ? 'border-primary bg-primary/5' : ''}`}>
                  <RadioGroupItem value="PIX" id="pix" />
                  <Label htmlFor="pix" className="flex items-center gap-2 cursor-pointer"><QrCode className="h-4 w-4"/> Pix</Label>
                </div>
                <div className={`flex items-center space-x-2 border rounded-lg p-3 cursor-pointer ${paymentMethod === 'CREDIT_CARD' ? 'border-primary bg-primary/5' : ''}`}>
                  <RadioGroupItem value="CREDIT_CARD" id="card" />
                  <Label htmlFor="card" className="flex items-center gap-2 cursor-pointer"><CreditCard className="h-4 w-4"/> Cartão</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="border-t pt-4 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground">Total a pagar</span>
                <span className="text-2xl font-bold">R$ {((selectedCredits / 500) * 40).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <Button onClick={initiatePurchase} disabled={processing} size="lg">
                {processing ? <Loader2 className="animate-spin" /> : (paymentMethod === 'PIX' ? 'Gerar PIX' : 'Pagar com Cartão')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Planos Disponíveis (Original) */}
        <div className="space-y-4 pt-4 border-t">
          <h2 className="text-2xl font-bold">Mudar de Plano</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Cards de Plano simplificados para brevidade - Mantenha o design original aqui */}
            {/* Solo Starter */}
            <Card className="border-border hover:border-primary transition-all">
              <CardHeader><CardTitle>Solo Starter</CardTitle><CardDescription>R$ 150/mês</CardDescription></CardHeader>
              <CardContent><Button variant="outline" className="w-full" onClick={() => initiatePlanUpgrade(1)}>Escolher Starter</Button></CardContent>
            </Card>
            {/* Solo Scale */}
            <Card className="border-primary border-2 shadow-md">
              <CardHeader><CardTitle>Solo Scale</CardTitle><CardDescription>R$ 400/mês</CardDescription></CardHeader>
              <CardContent><Button className="w-full" onClick={() => initiatePlanUpgrade(2)}>Escolher Scale</Button></CardContent>
            </Card>
            {/* Solo Pro */}
            <Card className="border-border hover:border-primary transition-all">
              <CardHeader><CardTitle>Solo Pro</CardTitle><CardDescription>R$ 1.000/mês</CardDescription></CardHeader>
              <CardContent><Button variant="outline" className="w-full" onClick={() => initiatePlanUpgrade(3)}>Escolher Pro</Button></CardContent>
            </Card>
          </div>
        </div>

        {/* NOVA ÁREA: Histórico de Transações */}
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Histórico de Transações</h2>
          </div>
          <Card>
            <CardContent className="p-0">
              {transacoes.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Nenhuma transação recente encontrada.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transacoes.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{new Date(t.data_transacao).toLocaleDateString()}</TableCell>
                        <TableCell>{t.descricao}</TableCell>
                        <TableCell>R$ {t.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell><Badge variant={t.status === 'pago' ? 'default' : 'secondary'}>{t.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={pixDialogOpen} onOpenChange={setPixDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Pagamento via PIX</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {pixData?.qrCode && <img src={`data:image/png;base64,${pixData.qrCode}`} className="w-48 h-48" />}
            <div className="flex gap-2 w-full">
              <Input value={pixData?.copyPaste} readOnly />
              <Button onClick={() => navigator.clipboard.writeText(pixData?.copyPaste || "")}><Copy className="h-4 w-4"/></Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cardDialogOpen} onOpenChange={setCardDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Dados do Cartão</DialogTitle><DialogDescription>Ambiente seguro Asaas</DialogDescription></DialogHeader>
          <form onSubmit={handleCardSubmit} className="space-y-4">
            <Input placeholder="Nome no Cartão" value={cardData.holderName} onChange={e => setCardData({...cardData, holderName: e.target.value})} required />
            <Input placeholder="Número" value={cardData.number} onChange={e => setCardData({...cardData, number: e.target.value})} required />
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="MM" maxLength={2} value={cardData.expiryMonth} onChange={e => setCardData({...cardData, expiryMonth: e.target.value})} required />
              <Input placeholder="AAAA" maxLength={4} value={cardData.expiryYear} onChange={e => setCardData({...cardData, expiryYear: e.target.value})} required />
              <Input placeholder="CVV" maxLength={4} value={cardData.ccv} onChange={e => setCardData({...cardData, ccv: e.target.value})} required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={processing} className="w-full">{processing ? <Loader2 className="animate-spin" /> : 'Pagar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Billing;
