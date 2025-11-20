import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCcw, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Equipe {
  id: string;
  nome_cliente: string;
  creditos_avulsos: number;
  limite_creditos: number | null;
}

interface ConsumoAtual {
  periodo: string;
  creditos_utilizados: number;
}

const Admin = () => {
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [selectedEquipeId, setSelectedEquipeId] = useState<string>("");
  const [action, setAction] = useState<string>("reset_balance");
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [consumoAtual, setConsumoAtual] = useState<ConsumoAtual | null>(null);
  const { toast } = useToast();

  const fetchEquipes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('equipes')
        .select('id, nome_cliente, creditos_avulsos, limite_creditos')
        .order('nome_cliente');

      if (error) throw error;
      setEquipes(data || []);
    } catch (error: any) {
      console.error('Error fetching equipes:', error);
      toast({
        title: "Erro ao carregar equipes",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchConsumoAtual = async (equipeId: string) => {
    try {
      const now = new Date();
      const periodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      const { data, error } = await supabase
        .from('consumo_creditos')
        .select('periodo, creditos_utilizados')
        .eq('equipe_id', equipeId)
        .eq('periodo', periodo)
        .maybeSingle();

      if (error) throw error;
      setConsumoAtual(data);
    } catch (error: any) {
      console.error('Error fetching consumo:', error);
      setConsumoAtual(null);
    }
  };

  useEffect(() => {
    if (!adminLoading && isAdmin) {
      fetchEquipes();
    }
  }, [adminLoading, isAdmin]);

  useEffect(() => {
    if (selectedEquipeId) {
      fetchConsumoAtual(selectedEquipeId);
    } else {
      setConsumoAtual(null);
    }
  }, [selectedEquipeId]);

  const handleAdjustCredits = async () => {
    if (!selectedEquipeId) {
      toast({
        title: "Erro",
        description: "Selecione uma equipe",
        variant: "destructive",
      });
      return;
    }

    if (!reason.trim()) {
      toast({
        title: "Erro",
        description: "Informe o motivo do ajuste",
        variant: "destructive",
      });
      return;
    }

    if ((action === 'add_credits' || action === 'remove_credits') && (!amount || parseInt(amount) <= 0)) {
      toast({
        title: "Erro",
        description: "Informe um valor válido",
        variant: "destructive",
      });
      return;
    }

    try {
      setProcessing(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const body: any = {
        equipe_id: selectedEquipeId,
        action,
        reason,
      };

      if (action === 'add_credits' || action === 'remove_credits') {
        body.amount = parseInt(amount);
      }

      const { data, error } = await supabase.functions.invoke('admin-adjust-credits', {
        body,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: `Créditos ajustados para ${data.team}`,
      });

      // Reset form
      setSelectedEquipeId("");
      setAction("reset_balance");
      setAmount("");
      setReason("");
      setConsumoAtual(null);
      
      // Refresh equipes list
      fetchEquipes();
    } catch (error: any) {
      console.error('Error adjusting credits:', error);
      toast({
        title: "Erro ao ajustar créditos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  if (adminLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Você não tem permissão para acessar esta página.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const selectedEquipe = equipes.find(e => e.id === selectedEquipeId);

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-border bg-gradient-to-r from-background to-soft-gray">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Painel <span className="text-primary">Administrativo</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Gerenciamento de Créditos das Equipes
              </p>
            </div>
            <Button onClick={fetchEquipes} variant="outline" size="icon" disabled={loading}>
              <RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 container mx-auto px-4 py-6 space-y-6">
        {/* Credit Adjustment Form */}
        <Card>
          <CardHeader>
            <CardTitle>Ajustar Créditos</CardTitle>
            <CardDescription>
              Gerencie o saldo de créditos das equipes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Equipe</Label>
              <Select value={selectedEquipeId} onValueChange={setSelectedEquipeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma equipe" />
                </SelectTrigger>
                <SelectContent>
                  {equipes.map((equipe) => (
                    <SelectItem key={equipe.id} value={equipe.id}>
                      {equipe.nome_cliente}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedEquipe && (
              <Alert>
                <AlertDescription className="space-y-1">
                  <div className="flex justify-between">
                    <span className="font-medium">Limite do Plano:</span>
                    <span>{selectedEquipe.limite_creditos || 0} créditos</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Créditos Avulsos:</span>
                    <span>{selectedEquipe.creditos_avulsos} créditos</span>
                  </div>
                  {consumoAtual && (
                    <div className="flex justify-between">
                      <span className="font-medium">Consumo Atual ({consumoAtual.periodo}):</span>
                      <span>{consumoAtual.creditos_utilizados} créditos</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-1 mt-1">
                    <span className="font-bold">Saldo Total:</span>
                    <span className="font-bold">
                      {(selectedEquipe.limite_creditos || 0) + selectedEquipe.creditos_avulsos - (consumoAtual?.creditos_utilizados || 0)} créditos
                    </span>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label>Ação</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reset_balance">Resetar Saldo (Compensar Consumo)</SelectItem>
                  <SelectItem value="add_credits">Adicionar Créditos Avulsos</SelectItem>
                  <SelectItem value="remove_credits">Remover Créditos Avulsos</SelectItem>
                  <SelectItem value="clear_extra_credits">Zerar Créditos Avulsos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(action === 'add_credits' || action === 'remove_credits') && (
              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Digite a quantidade de créditos"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Motivo</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Descreva o motivo do ajuste"
              />
            </div>

            <Button 
              onClick={handleAdjustCredits} 
              disabled={processing || !selectedEquipeId}
              className="w-full"
            >
              {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Executar Ajuste
            </Button>
          </CardContent>
        </Card>

        {/* Teams Table */}
        <Card>
          <CardHeader>
            <CardTitle>Equipes Cadastradas</CardTitle>
            <CardDescription>
              Visão geral do saldo de créditos
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipe</TableHead>
                    <TableHead className="text-right">Limite Plano</TableHead>
                    <TableHead className="text-right">Créditos Avulsos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipes.map((equipe) => (
                    <TableRow key={equipe.id}>
                      <TableCell className="font-medium">{equipe.nome_cliente}</TableCell>
                      <TableCell className="text-right">{equipe.limite_creditos || 0}</TableCell>
                      <TableCell className="text-right">{equipe.creditos_avulsos}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Admin;
