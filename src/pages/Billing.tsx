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
import { Zap, Loader2, CreditCard, History, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
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

const Billing = () => {
  const { user } = useAuth();
  const [creditData, setCreditData] = useState<CreditData | null>(null);
  const [statusAssinatura, setStatusAssinatura] = useState<string>('active');
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedCredits, setSelectedCredits] = useState<number>(1000);
  const { toast } = useToast();

  const fetchData = async () => {
    try {
      setLoading(true);
      // 1. Créditos
      const { data: creds, error } = await supabase.functions.invoke('fetch-gpt-credits');
      if (!error && creds) setCreditData(creds);

      // 2. Dados da Equipe
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
    setProcessing(true);
    try {
        if (!user) throw new Error("Sessão inválida");
        
        let body = {};
        let funcName = '';

        if (type === 'credits') {
            const amount = (value / 500) * 40; // R$ 40 a cada 500 créditos
            body = { amount, credits: value, user_id_override: user.id }; // Envia user_id manual para garantir
            funcName = 'asaas-buy-credits';
        } else {
            // Assinatura
            body = { plano_id: value }; // value aqui é o ID do plano
            funcName = 'asaas-subscribe';
        }

        const { data, error } = await supabase.functions.invoke(funcName, { body });
        
        if (error) throw new Error(error.message);
        if (data.error) throw new Error(data.error);

        // REDIRECIONA PARA O CHECKOUT SEGURO DO ASAAS
        if (data.invoiceUrl) {
            window.location.href = data.invoiceUrl;
        } else {
            toast({ title: "Erro", description: "Link de pagamento não gerado.", variant: "destructive" });
        }

    } catch (error: any) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
        setProcessing(false);
    }
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>;

  return (
    <div className="flex-1 flex flex-col p-6 space-y-8">
      {/* Header & Status */}
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold">Billing & Assinatura</h1>
          <p className="text-muted-foreground">Gerencie seus pagamentos e limites</p>
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
        <TabsList>
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="plans">Planos</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        {/* VISÃO GERAL */}
        <TabsContent value="overview" className="space-y-6">
            {/* Card de Consumo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle>Saldo de Créditos</CardTitle></CardHeader>
                    <CardContent>
                        <div className="flex items-end gap-2">
                            <span className="text-4xl font-bold">{creditData?.creditsBalance?.toLocaleString() || 0}</span>
                            <span className="text-muted-foreground mb-1">/ {creditData?.totalCredits?.toLocaleString()}</span>
                        </div>
                        <Progress value={creditData?.totalCredits ? (creditData.creditsSpent / creditData.totalCredits) * 100 : 0} className="h-3 mt-4" />
                        <p className="text-sm text-muted-foreground mt-2">{creditData?.creditsSpent} utilizados este mês</p>
                    </CardContent>
                </Card>

                <Card className="border-primary/20 bg-primary/5">
                    <CardHeader><CardTitle>Recarga Rápida</CardTitle><CardDescription>Compre créditos avulsos</CardDescription></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-lg font-semibold">{selectedCredits.toLocaleString()} créditos</span>
                            <span className="text-xl font-bold text-primary">R$ {((selectedCredits/500)*40).toFixed(2)}</span>
                        </div>
                        <Slider value={[selectedCredits]} onValueChange={(v) => setSelectedCredits(v[0])} min={500} max={5000} step={500} />
                        <Button className="w-full" onClick={() => handlePurchase('credits', selectedCredits)} disabled={processing}>
                            {processing ? <Loader2 className="animate-spin mr-2"/> : <Zap className="w-4 h-4 mr-2"/>}
                            Comprar Créditos
                        </Button>
                        <p className="text-xs text-center text-muted-foreground">Você será redirecionado para o pagamento seguro.</p>
                    </CardContent>
                </Card>
            </div>
        </TabsContent>

        {/* PLANOS (LAYOUT DE CARDS RESTAURADO) */}
        <TabsContent value="plans">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { id: 1, name: "Solo Starter", price: "200", credits: "1.000", users: "Até 3" },
                    { id: 2, name: "Solo Scale", price: "400", credits: "3.000", users: "Até 5", popular: true },
                    { id: 3, name: "Solo Pro", price: "1.000", credits: "10.000", users: "Ilimitado" }
                ].map((p) => (
                    <Card key={p.id} className={`flex flex-col ${p.popular ? 'border-primary shadow-lg scale-105 relative' : ''}`}>
                        {p.popular && <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs px-2 py-1 rounded-bl-lg">Popular</div>}
                        <CardHeader>
                            <CardTitle>{p.name}</CardTitle>
                            <div className="text-3xl font-bold mt-2">R$ {p.price}<span className="text-sm font-normal text-muted-foreground">/mês</span></div>
                        </CardHeader>
                        <CardContent className="flex-1 space-y-4">
                            <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-primary"/> {p.credits} créditos mensais</div>
                            <div className="flex items-center gap-2"><Users className="w-4 h-4 text-primary"/> {p.users} usuários</div>
                            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500"/> Setup do Agente</div>
                            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500"/> Central de Chat</div>
                        </CardContent>
                        <CardFooter>
                            <Button className="w-full" variant={p.popular ? "default" : "outline"} onClick={() => handlePurchase('plan', p.id)} disabled={processing}>
                                {processing ? <Loader2 className="animate-spin"/> : 'Assinar Agora'}
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </TabsContent>

        {/* HISTÓRICO */}
        <TabsContent value="history">
            <Card>
                <CardHeader><CardTitle>Histórico de Transações</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead>Fatura</TableHead></TableRow>
                        </TableHeader>
                        <TableBody>
                            {transacoes.map((t) => (
                                <TableRow key={t.id}>
                                    <TableCell>{new Date(t.data_transacao).toLocaleDateString()}</TableCell>
                                    <TableCell>{t.descricao}</TableCell>
                                    <TableCell>R$ {t.valor.toFixed(2)}</TableCell>
                                    <TableCell><Badge variant={t.status === 'pago' ? 'default' : 'secondary'}>{t.status}</Badge></TableCell>
                                    <TableCell>
                                        {t.invoice_url && (
                                            <a href={t.invoice_url} target="_blank" rel="noopener" className="text-primary hover:underline flex items-center gap-1">
                                                Ver <ExternalLink className="w-3 h-3"/>
                                            </a>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {transacoes.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-4">Nenhuma transação encontrada.</TableCell></TableRow>}
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
