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
import { Zap, TrendingUp, Loader2, RefreshCcw, ExternalLink, MessageCircle, CreditCard, QrCode, Copy, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CreditData {
  creditsSpent: number;
  creditsBalance: number;
  totalCredits?: number;
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

const Billing = () => {
  const [creditData, setCreditData] = useState<CreditData | null>(null);
  const [plano, setPlano] = useState<Plano | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCredits, setSelectedCredits] = useState<number>(1000);
  const [paymentMethod, setPaymentMethod] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [processing, setProcessing] = useState(false);
  const [pixDialogOpen, setPixDialogOpen] = useState(false);
  const [pixData, setPixData] = useState<{ qrCode: string; copyPaste: string } | null>(null);
  const { toast } = useToast();

  const fetchCredits = async () => {
    try {
      setLoading(true);
      
      // Fetch credit data
      const { data: creditResponse, error: creditError } = await supabase.functions.invoke('fetch-gpt-credits');
      if (creditError) throw creditError;
      setCreditData(creditResponse);

      // Fetch user's team plan
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

  const handleRecharge = () => {
    const totalCost = (selectedCredits / 500) * 40;
    const message = `Olá! Gostaria de recarregar ${selectedCredits.toLocaleString()} créditos AdvAI (R$ ${totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`;
    window.open(`https://wa.me/5585996487923?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleBuyCredits = async () => {
    try {
      setProcessing(true);
      const totalCost = (selectedCredits / 500) * 40;

      const { data, error } = await supabase.functions.invoke('asaas-buy-credits', {
        body: {
          amount: totalCost,
          paymentMethod: paymentMethod,
          credits: selectedCredits,
        },
      });

      if (error) throw error;

      if (paymentMethod === "PIX" && data.pixQrCode && data.pixCopyPaste) {
        setPixData({
          qrCode: data.pixQrCode,
          copyPaste: data.pixCopyPaste,
        });
        setPixDialogOpen(true);
      } else if (data.invoiceUrl) {
        window.location.href = data.invoiceUrl;
      }

      toast({
        title: "Pagamento criado",
        description: "Redirecionando para o checkout...",
      });

    } catch (error: any) {
      console.error('Error buying credits:', error);
      toast({
        title: "Erro ao processar pagamento",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleUpgradePlan = async (planoId: number) => {
    try {
      setProcessing(true);

      const { data, error } = await supabase.functions.invoke('asaas-subscribe', {
        body: {
          plano_id: planoId,
        },
      });

      if (error) throw error;

      if (data.invoiceUrl) {
        window.location.href = data.invoiceUrl;
      }

      toast({
        title: "Assinatura criada",
        description: "Redirecionando para o checkout...",
      });

    } catch (error: any) {
      console.error('Error upgrading plan:', error);
      toast({
        title: "Erro ao processar assinatura",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const copyPixCode = () => {
    if (pixData?.copyPaste) {
      navigator.clipboard.writeText(pixData.copyPaste);
      toast({
        title: "Código copiado!",
        description: "Cole no seu app bancário para pagar",
      });
    }
  };

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

      <div className="flex-1 container mx-auto px-4 py-6 space-y-6">
        {/* Current Plan Card */}
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
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-2">Funcionalidades Incluídas:</p>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {plano.funcionalidades.map((func, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-center gap-2">
                      <span className="text-primary">✓</span>
                      {func}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Credit Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Saldo Disponível</CardTitle>
              <Zap className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{creditData?.creditsBalance || 0}</div>
              <p className="text-xs text-muted-foreground">Créditos restantes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Consumo Mensal</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{creditData?.creditsSpent || 0}</div>
              <p className="text-xs text-muted-foreground">Créditos utilizados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Taxa de Uso</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{usagePercentage.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">Do total disponível</p>
            </CardContent>
          </Card>
        </div>

        {/* Usage Progress */}
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

            <div className="pt-4 space-y-2 border-t">
              <h3 className="font-semibold text-sm">Detalhes do Período</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Período</p>
                  <p className="font-medium">{creditData?.periodo}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium text-green-600">Ativo</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Credit Recharge with Asaas */}
        <Card>
          <CardHeader>
            <CardTitle>Recarga de Créditos AdvAI</CardTitle>
            <CardDescription>
              Adicione créditos para continuar utilizando a plataforma sem interrupções
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Quantidade de Créditos AdvAI</label>
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
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>500</span>
                <span>10.000</span>
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-medium">Método de Pagamento</Label>
              <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as "PIX" | "CREDIT_CARD")}>
                <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-accent">
                  <RadioGroupItem value="PIX" id="pix" />
                  <Label htmlFor="pix" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <QrCode className="h-4 w-4" />
                      <span>Pix (Aprovação Instantânea)</span>
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-accent">
                  <RadioGroupItem value="CREDIT_CARD" id="card" />
                  <Label htmlFor="card" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      <span>Cartão de Crédito</span>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-muted-foreground">Valor Total</span>
                <span className="text-3xl font-bold text-foreground">
                  R$ {((selectedCredits / 500) * 40).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <Button 
                onClick={handleBuyCredits} 
                className="w-full" 
                size="lg"
                disabled={processing}
              >
                {processing ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    {paymentMethod === "PIX" ? <QrCode className="h-5 w-5 mr-2" /> : <CreditCard className="h-5 w-5 mr-2" />}
                    Comprar Créditos
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                🔒 Pagamento seguro via Asaas Gateway
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Alternative: WhatsApp */}
        <Card>
          <CardHeader>
            <CardTitle>Atendimento Personalizado</CardTitle>
            <CardDescription>Prefere falar com nossa equipe?</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleRecharge} variant="outline" className="w-full" size="lg">
              <MessageCircle className="h-5 w-5 mr-2" />
              Solicitar via WhatsApp
            </Button>
          </CardContent>
        </Card>

        {/* Available Plans Section */}
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Planos AdvAI</h2>
            <p className="text-sm text-muted-foreground">
              Escolha o plano ideal para escalar sua operação jurídica
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Solo Starter */}
            <Card className="relative border-border hover:border-primary/50 transition-all duration-300">
              <CardHeader>
                <CardTitle className="text-xl">Solo Starter</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Para quem está começando a automatizar
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-4xl font-bold text-foreground">
                    R$ 150<span className="text-lg font-normal text-muted-foreground">/mês</span>
                  </p>
                </div>
                
                <div className="space-y-2 py-4 border-t border-b">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">1.000 Créditos AdvAI</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Até 3 Usuários</span>
                  </div>
                </div>

                <ul className="space-y-2">
                  <li className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Setup completo do Agente AdvAI</span>
                  </li>
                  <li className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Acesso à Central de Atendimento</span>
                  </li>
                  <li className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Pipeline Comercial (Visualização)</span>
                  </li>
                  <li className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Suporte via WhatsApp</span>
                  </li>
                </ul>

                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => handleUpgradePlan(1)}
                  disabled={processing}
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    "Escolher Starter"
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Solo Scale - DESTAQUE */}
            <Card className="relative border-2 border-primary shadow-[var(--shadow-elegant)] transform scale-105">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-gradient-to-r from-primary to-[hsl(45_100%_60%)] text-primary-foreground px-4 py-1 font-bold">
                  Mais Popular
                </Badge>
              </div>
              
              <CardHeader className="pt-8">
                <CardTitle className="text-xl">Solo Scale</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Escritórios em expansão que precisam de dados
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-4xl font-bold text-foreground">
                    R$ 400<span className="text-lg font-normal text-muted-foreground">/mês</span>
                  </p>
                </div>
                
                <div className="space-y-2 py-4 border-t border-b">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">3.000 Créditos AdvAI</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Até 5 Usuários</span>
                  </div>
                </div>

                <ul className="space-y-2">
                  <li className="text-sm text-foreground/80 flex items-start gap-2 font-medium">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Tudo do Starter +</span>
                  </li>
                  <li className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Dashboard de Performance Avançado</span>
                  </li>
                  <li className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Gestão de Billing Completa</span>
                  </li>
                  <li className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Suporte Builder Mode (1h/mês)</span>
                  </li>
                  <li className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Prioridade no suporte</span>
                  </li>
                </ul>

                <Button 
                  className="w-full bg-gradient-to-r from-primary to-[hsl(45_100%_60%)] hover:opacity-90 transition-opacity"
                  onClick={() => handleUpgradePlan(2)}
                  disabled={processing}
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    "Escolher Scale"
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Solo Pro */}
            <Card className="relative border-border hover:border-primary/50 transition-all duration-300">
              <CardHeader>
                <CardTitle className="text-xl">Solo Pro</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Operações robustas que demandam personalização
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-4xl font-bold text-foreground">
                    R$ 1.000<span className="text-lg font-normal text-muted-foreground">/mês</span>
                  </p>
                </div>
                
                <div className="space-y-2 py-4 border-t border-b">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">10.000 Créditos AdvAI</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Usuários Ilimitados</span>
                  </div>
                </div>

                <ul className="space-y-2">
                  <li className="text-sm text-foreground/80 flex items-start gap-2 font-medium">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Tudo do Scale +</span>
                  </li>
                  <li className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Consultoria de Desenvolvimento</span>
                  </li>
                  <li className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Suporte Builder Mode Prioritário (3h/mês)</span>
                  </li>
                  <li className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Customizações avançadas</span>
                  </li>
                  <li className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>SLA dedicado</span>
                  </li>
                </ul>

                <Button 
                  variant="outline" 
                  className="w-full border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                  onClick={() => handleUpgradePlan(3)}
                  disabled={processing}
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    "Escolher Pro"
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Warning for low credits */}
        {usagePercentage > 80 && (
          <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <CardHeader>
              <CardTitle className="text-yellow-800 dark:text-yellow-200">
                Atenção: Créditos Baixos
              </CardTitle>
              <CardDescription className="text-yellow-700 dark:text-yellow-300">
                Você já utilizou {usagePercentage.toFixed(0)}% dos seus créditos mensais.
                Clique em "Recarregar Créditos" acima para adicionar mais.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      {/* PIX Dialog */}
      <Dialog open={pixDialogOpen} onOpenChange={setPixDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pagamento via PIX</DialogTitle>
            <DialogDescription>
              Escaneie o QR Code ou copie o código Pix para efetuar o pagamento
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {pixData?.qrCode && (
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <img 
                  src={`data:image/png;base64,${pixData.qrCode}`} 
                  alt="QR Code PIX" 
                  className="w-64 h-64"
                />
              </div>
            )}
            {pixData?.copyPaste && (
              <div className="space-y-2">
                <Label htmlFor="pix-code">Código PIX (Copia e Cola)</Label>
                <div className="flex gap-2">
                  <input
                    id="pix-code"
                    value={pixData.copyPaste}
                    readOnly
                    className="flex-1 px-3 py-2 text-sm border rounded-md bg-muted"
                  />
                  <Button onClick={copyPixCode} size="sm">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            <div className="text-xs text-muted-foreground text-center">
              O pagamento será confirmado automaticamente após o processamento
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Billing;
