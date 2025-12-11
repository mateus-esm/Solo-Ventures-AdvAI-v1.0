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

interface CreditData { creditsSpent: number; creditsBalance: number; totalCredits: number; planLimit: number; extraCredits: number; periodo: string; }
interface Transacao { id: string; tipo: string; valor: number; status: string; descricao: string; data_transacao: string; invoice_url?: string; }
interface HistoricoConsumo { periodo: string; creditos_utilizados: number; }

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
    { id: 1, name: "Solo Starter", price: "200", description: "Ideal para iniciar", features: [{ text: "1.000 créditos", included: true }, { text: "3 Usuários", included: true }] },
    { id: 2, name: "Solo Scale", price: "400", popular: true, description: "Mais vendido", features: [{ text: "3.000 créditos", included: true }, { text: "5 Usuários", included: true }] },
    { id: 3, name: "Solo Pro", price: "1.000", badge: "Enterprise", description: "Alta demanda", features: [{ text: "10.000 créditos", included: true }, { text: "Ilimitado", included: true }] }
  ];

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

            const { data: cons } = await supabase.from('consumo_creditos').select('*').eq('equipe_id', profile.equipe_id).order('periodo', { ascending: false }).limit(12);
            if (cons) setHistoricoConsumo(cons);
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
    const loadingKey = type === 'plan' ? value.toString() : 'credits';
    setProcessing(loadingKey);
    
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            toast({ title: "Sessão expirada", description: "Faça login novamente.", variant: "destructive" });
            return;
        }

        toast({ title: "Aguarde...", description: "Estamos gerando seu link seguro junto ao banco..." });

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

        // REDIRECIONA
        window.location.href = data.invoiceUrl;

    } catch (error: any) {
        toast({ title: "Erro no processamento", description: error.message, variant: "destructive" });
    } finally {
        setProcessing(null);
    }
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>;

  return (
    <div className="flex-1 flex flex-col p-6 space-y-8">
      <div className="flex justify-between items-center border-b pb-4">
        <div><h1 className="text-3xl font-bold">Billing & Assinatura</h1><p className="text-muted-foreground">Gerencie seus pagamentos</p></div>
        <Badge variant={statusAssinatura === 'active' ? 'default' : 'destructive'} className="h-8 px-4">{statusAssinatura === 'active' ? 'Regular' : 'Pendente'}</Badge>
      </div>

      {statusAssinatura !== 'active' && <Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertTitle>Pagamento Pendente</AlertTitle><AlertDescription>Regularize sua assinatura.</AlertDescription></Alert>}

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-[400px]">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger><TabsTrigger value="plans">Planos</TabsTrigger><TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <div className="flex justify-between"><CardTitle>Saldo</CardTitle>{filterLoading && <Loader2 className="animate-spin w-4 h-4"/>}</div>
                        <div className="flex gap-2 mt-2">
                            <Select value={filterMonth} onValueChange={(v) => handleFilterChange('month', v)}><SelectTrigger className="w-[120px]"><SelectValue/></SelectTrigger><SelectContent>{Array.from({length:12},(_,i)=>i+1).map(m=><SelectItem key={m} value={m.toString()}>{m}</SelectItem>)}</SelectContent></Select>
                            <Select value={filterYear} onValueChange={(v) => handleFilterChange('year', v)}><SelectTrigger className="w-[90px]"><SelectValue/></SelectTrigger><SelectContent>{[2024,2025,2026].map(y=><SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent></Select>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-end gap-2 mb-4"><span className="text-4xl font-bold">{creditData?.creditsBalance?.toLocaleString() || 0}</span><span className="text-muted-foreground">/ {creditData?.totalCredits?.toLocaleString()}</span></div>
                        <Progress value={creditData?.totalCredits ? (creditData.creditsSpent/creditData.totalCredits)*100 : 0} className="h-3 mb-4"/>
                        <div className="space-y-1 text-sm"><div className="flex justify-between"><span>Plano:</span><span>{creditData?.planLimit}</span></div><div className="flex justify-between"><span>Avulso:</span><span>+{creditData?.extraCredits}</span></div><div className="flex justify-between text-red-500"><span>Usado:</span><span>-{creditData?.creditsSpent}</span></div></div>
                    </CardContent>
                </Card>
                <Card className="bg-primary/5 border-primary/20">
                    <CardHeader><CardTitle>Recarga</CardTitle><CardDescription>Adicione créditos</CardDescription></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between font-bold"><span>{selectedCredits.toLocaleString()} créditos</span><span className="text-primary">R$ {((selectedCredits/500)*40).toFixed(2)}</span></div>
                        <Slider value={[selectedCredits]} onValueChange={(v)=>setSelectedCredits(v[0])} min={500} max={5000} step={500}/>
                        <Button className="w-full" onClick={() => handleRedirectPayment('credits', selectedCredits)} disabled={processing === 'credits'}>
                            {processing === 'credits' ? <Loader2 className="animate-spin mr-2"/> : <Zap className="mr-2 h-4 w-4"/>} Pagar com Pix/Cartão
                        </Button>
                        <div className="flex justify-center text-xs text-muted-foreground gap-1"><ShieldCheck className="w-3 h-3"/> Checkout seguro Asaas</div>
                    </CardContent>
                </Card>
            </div>
        </TabsContent>

        <TabsContent value="plans">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {planos.map((p) => (
                    <Card key={p.id} className={`flex flex-col ${p.popular ? 'border-primary shadow-lg scale-105' : ''}`}>
                        <CardHeader><CardTitle>{p.name}</CardTitle><div className="text-3xl font-bold mt-2">R$ {p.price}<span className="text-sm font-normal text-muted-foreground">/mês</span></div></CardHeader>
                        <CardContent className="flex-1 space-y-2">{p.features.map((f,i)=><div key={i} className="flex gap-2 text-sm">{f.included?<CheckCircle2 className="w-4 h-4 text-green-500"/>:<X className="w-4 h-4 text-muted-foreground"/>}{f.text}</div>)}</CardContent>
                        <CardFooter><Button className="w-full" variant={p.popular?"default":"outline"} onClick={()=>handleRedirectPayment('plan', p.id)} disabled={!!processing}>{processing===p.id.toString()?'Processando...':'Assinar Agora'}</Button></CardFooter>
                    </Card>
                ))}
            </div>
        </TabsContent>

        <TabsContent value="history">
            <Card><CardHeader><CardTitle>Histórico</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Desc.</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>
                {transacoes.map(t=>(<TableRow key={t.id}><TableCell>{new Date(t.data_transacao).toLocaleDateString()}</TableCell><TableCell>{t.descricao}</TableCell><TableCell>R$ {t.valor.toFixed(2)}</TableCell><TableCell><Badge variant={t.status==='pago'?'default':'secondary'}>{t.status}</Badge></TableCell><TableCell>{t.invoice_url && <a href={t.invoice_url} target="_blank" className="text-primary hover:underline flex items-center gap-1"><ExternalLink className="w-3 h-3"/>Fatura</a>}</TableCell></TableRow>))}
                {transacoes.length===0 && <TableRow><TableCell colSpan={5} className="text-center py-4">Sem transações.</TableCell></TableRow>}
            </TableBody></Table></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Billing;
