import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Importar Tabs
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"; // Importar Table
import { Zap, TrendingUp, Loader2, RefreshCcw, MessageCircle, CreditCard, QrCode, Copy, Users, History, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Interfaces existentes...
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

// Nova interface para transações
interface Transacao {
  id: string;
  tipo: string;
  valor: number;
  status: string;
  descricao: string;
  data_transacao: string;
}

// Nova interface para histórico de consumo
interface HistoricoConsumo {
  periodo: string;
  creditos_utilizados: number;
}

const Billing = () => {
  // States existentes...
  const [creditData, setCreditData] = useState<CreditData | null>(null);
  const [plano, setPlano] = useState<Plano | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCredits, setSelectedCredits] = useState<number>(1000);
  const [paymentMethod, setPaymentMethod] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [processing, setProcessing] = useState(false);
  const [pixDialogOpen, setPixDialogOpen] = useState(false);
  const [pixData, setPixData] = useState<{ qrCode: string; copyPaste: string } | null>(null);
  
  // Novos states para histórico
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [historicoConsumo, setHistoricoConsumo] = useState<HistoricoConsumo[]>([]);
  
  const { toast } = useToast();

  const fetchCredits = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch credit data (Função existente)
      const { data: creditResponse, error: creditError } = await supabase.functions.invoke('fetch-gpt-credits');
      if (creditError) throw creditError;
      setCreditData(creditResponse);

      // 2. Fetch user's team & plan
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('equipe_id')
        .eq('user_id', user.id)
        .single();

      if (profile?.equipe_id) {
        const { data: equipe } = await supabase
          .from('equipes')
          .select('plano_id, planos(*)')
          .eq('id', profile.equipe_id)
          .single();

        if (equipe?.planos) {
          setPlano(equipe.planos as unknown as Plano);
        }

        // 3. NOVO: Buscar Transações
        const { data: transacoesData } = await supabase
          .from('transacoes')
          .select('*')
          .eq('equipe_id', profile.equipe_id)
          .order('data_transacao', { ascending: false })
          .limit(10);
        
        if (transacoesData) setTransacoes(transacoesData);

        // 4. NOVO: Buscar Histórico de Consumo
        const { data: consumoData } = await supabase
          .from('consumo_creditos')
          .select('periodo, creditos_utilizados')
          .eq('equipe_id', profile.equipe_id)
          .order('periodo', { ascending: false })
          .limit(12);

        if (consumoData) setHistoricoConsumo(consumoData);
      }
    } catch (error: any) {
      console.error('Error fetching billing data:', error);
      toast({
        title: "Erro ao carregar dados",
        description: error.message || "Não foi possível carregar os dados de billing",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // ... (Funções handleRecharge, handleBuyCredits, handleUpgradePlan mantidas iguais ao original) ...
  // Apenas certifique-se que o handleBuyCredits agora insira na tabela 'transacoes' após sucesso no Asaas, 
  // ou implemente um Webhook do Asaas para inserir automaticamente.

  useEffect(() => {
    fetchCredits();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalCredits = creditData?.totalCredits || plano?.limite_creditos || 1000;
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
          <TabsList>
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="history">Histórico & Pagamentos</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* ... Todo o conteúdo original da aba de visão geral (Cards, Progress, Recarga, Planos) vai aqui ... */}
            {/* Como o código original é longo, estou representando que ele se mantém aqui */}
            {plano && (
              <Card>
                 <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Plano Atual</CardTitle>
                      <CardDescription>Detalhes da sua assinatura</CardDescription>
                    </div>
                    <Badge variant="secondary" className="text-lg px-4 py-1">
                      {plano.nome}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Valor Mensal</p>
                      <p className="text-2xl font-bold">
                        R$ {plano.preco_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Limite de Créditos</p>
                      <p className="text-2xl font-bold">{plano.limite_creditos.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Usuários</p>
                      <p className="text-2xl font-bold">
                        {plano.limite_usuarios ? plano.limite_usuarios : 'Ilimitado'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Cards de Consumo */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
               <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Saldo Disponível</CardTitle>
                  <Zap className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{creditData?.creditsBalance || 0}</div>
                  <p className="text-xs text-muted-foreground">Créditos restantes</p>
                </CardContent>
              </Card>
              {/* Outros cards... */}
            </div>

            {/* Barra de Progresso */}
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
                    <span className="text-muted-foreground">Créditos Utilizados</span>
                    <span className="font-medium">
                      {creditData?.creditsSpent || 0} / {totalCredits}
                    </span>
                  </div>
                  <Progress value={usagePercentage} className="h-2" />
                </div>
              </CardContent>
            </Card>
            
            {/* Área de Recarga (Card original mantido) */}
            {/* ... */}
          </TabsContent>

          {/* NOVA ÁREA DE HISTÓRICO */}
          <TabsContent value="history" className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Histórico de Transações */}
              <Card className="col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Pagamentos e Compras
                  </CardTitle>
                  <CardDescription>Histórico financeiro da sua conta</CardDescription>
                </CardHeader>
                <CardContent>
                  {transacoes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Nenhuma transação encontrada.
                    </div>
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
                            <TableCell>
                              <Badge variant={t.status === 'pago' || t.status === 'active' ? 'default' : 'secondary'}>
                                {t.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Histórico de Consumo de Créditos */}
              <Card className="col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Consumo Mensal
                  </CardTitle>
                  <CardDescription>Histórico de uso de créditos por mês</CardDescription>
                </CardHeader>
                <CardContent>
                  {historicoConsumo.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Sem dados de consumo histórico.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Período</TableHead>
                          <TableHead className="text-right">Créditos Utilizados</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historicoConsumo.map((h) => (
                          <TableRow key={h.periodo}>
                            <TableCell className="font-medium">{h.periodo}</TableCell>
                            <TableCell className="text-right">{h.creditos_utilizados.toLocaleString()}</TableCell>
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

      {/* PIX Dialog mantido... */}
    </div>
  );
};

export default Billing;
