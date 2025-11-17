import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Zap, TrendingUp, Loader2, RefreshCcw, ExternalLink, MessageCircle, CreditCard } from "lucide-react";
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
    window.open(`https://wa.me/5511999999999?text=${encodeURIComponent(message)}`, '_blank');
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
      <div className="border-b border-border bg-gradient-to-r from-background to-soft-gray">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-foreground">
            Billing <span className="text-primary">&amp; Créditos</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestão de consumo de créditos do AdvAI • {creditData?.periodo}
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

        {/* Credit Simulator */}
        <Card>
          <CardHeader>
            <CardTitle>Simulador de Créditos</CardTitle>
            <CardDescription>Calcule o custo de créditos extras (R$ 40,00 a cada 500 créditos)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Quantidade de Créditos</label>
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

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-muted-foreground">Valor Total</span>
                <span className="text-3xl font-bold text-foreground">
                  R$ {((selectedCredits / 500) * 40).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <Button onClick={handleRecharge} className="w-full" size="lg">
                <MessageCircle className="h-5 w-5 mr-2" />
                Solicitar via WhatsApp
              </Button>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                💡 A mensagem será gerada automaticamente com o valor calculado
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Recharge Options */}
        <Card>
          <CardHeader>
            <CardTitle>Outras Opções de Pagamento</CardTitle>
            <CardDescription>Métodos adicionais para recarregar créditos</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" size="lg" disabled>
              <CreditCard className="h-5 w-5 mr-2" />
              Pagamento Online (Em breve)
            </Button>
            <p className="text-xs text-muted-foreground mt-4 text-center">
              💡 Em breve você poderá fazer recarga diretamente via cartão ou PIX
            </p>
          </CardContent>
        </Card>

        {/* Available Plans Section */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-foreground mb-1">Planos Disponíveis</h2>
            <p className="text-sm text-muted-foreground">Faça upgrade e tenha acesso a mais recursos</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Starter Plan */}
            <Card className="relative">
              <CardHeader>
                <CardTitle className="text-lg">Solo Starter</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold">R$ 150</span>
                  <span className="text-muted-foreground">/mês</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary">1.000 créditos</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary">3 usuários</Badge>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>✓ Setup do Agente</li>
                  <li>✓ Acesso ao Chat</li>
                  <li>✓ Acesso ao CRM (Read-Only)</li>
                  <li>✓ Suporte para ajustes (limitado)</li>
                </ul>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    const message = "Olá! Gostaria de fazer upgrade para o plano Solo Starter (R$ 150/mês)";
                    window.open(`https://wa.me/5511999999999?text=${encodeURIComponent(message)}`, '_blank');
                  }}
                >
                  Fazer Upgrade
                </Button>
              </CardContent>
            </Card>

            {/* Scale Plan */}
            <Card className="relative border-primary shadow-lg">
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold rounded-bl-lg rounded-tr-lg">
                Popular
              </div>
              <CardHeader>
                <CardTitle className="text-lg">Solo Scale</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold">R$ 400</span>
                  <span className="text-muted-foreground">/mês</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary">3.000 créditos</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary">5 usuários</Badge>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>✓ Tudo do Starter</li>
                  <li>✓ Dashboard de Performance</li>
                  <li>✓ Billing</li>
                  <li>✓ Suporte Builder Mode (1h mensal)</li>
                </ul>
                <Button 
                  className="w-full"
                  onClick={() => {
                    const message = "Olá! Gostaria de fazer upgrade para o plano Solo Scale (R$ 400/mês)";
                    window.open(`https://wa.me/5511999999999?text=${encodeURIComponent(message)}`, '_blank');
                  }}
                >
                  Fazer Upgrade
                </Button>
              </CardContent>
            </Card>

            {/* Pro Plan */}
            <Card className="relative">
              <CardHeader>
                <CardTitle className="text-lg">Solo Pro</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold">R$ 1.000</span>
                  <span className="text-muted-foreground">/mês</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary">10.000 créditos</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary">Usuários Ilimitados</Badge>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>✓ Tudo do Scale</li>
                  <li>✓ Usuários Ilimitados</li>
                  <li>✓ Suporte Builder Mode (3h mensal)</li>
                </ul>
                <Button 
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const message = "Olá! Gostaria de fazer upgrade para o plano Solo Pro (R$ 1.000/mês)";
                    window.open(`https://wa.me/5511999999999?text=${encodeURIComponent(message)}`, '_blank');
                  }}
                >
                  Fazer Upgrade
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
    </div>
  );
};

export default Billing;
