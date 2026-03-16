// SafeView EPI — v1 | Feito por Gabriel Madureira
import { Activity, AlertTriangle, Clock, HardHat, TrendingUp, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { SessionsTable } from "@/components/dashboard/SessionsTable";
import { FatigueTrendChart as RiskTrendChart, EventsBarChart } from "@/components/dashboard/FatigueChart";
import { ChatWidget } from "@/components/dashboard/ChatWidget";
import { useMonitoringSessions } from "@/hooks/useMonitoringSessions";
import { useQueryClient } from "@tanstack/react-query";
import { localApi } from "@/integrations/supabase/client-local";
import { toast } from "sonner";

// Funções puras no nível do módulo — evita recriação a cada render
function normalizeRisk(v: number): number {
  return v > 0 && v <= 1 ? v * 100 : v;
}
function formatPct(v: number): string {
  const n = normalizeRisk(v);
  return Number.isFinite(n) ? (n % 1 === 0 ? String(n) : n.toFixed(1)) : "0";
}

function formatTotalDuration(sessions: { duracao_segundos: number }[]): string {
  const total = sessions.reduce((sum, s) => sum + s.duracao_segundos, 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

const Index = () => {
  const { data: sessions = [], isLoading, isError } = useMonitoringSessions();
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["sessoes_de_monitoramento"] });
  };

  const handleDelete = async (id: string) => {
    try {
      await localApi.sessions.delete(id);
      toast.success("Inspeção excluída com sucesso");
      queryClient.invalidateQueries({ queryKey: ["sessoes_de_monitoramento"] });
    } catch {
      toast.error("Erro ao excluir inspeção.");
    }
  };

  const totalAlerts        = sessions.reduce((sum, s) => sum + s.total_alertas, 0);
  const totalSemCapacete   = sessions.reduce((sum, s) => sum + s.eventos_sem_capacete, 0);
  const totalSemColete     = sessions.reduce((sum, s) => sum + s.eventos_sem_colete, 0);
  const totalSemLuvas      = sessions.reduce((sum, s) => sum + s.eventos_sem_luvas, 0);
  const totalSemOculos     = sessions.reduce((sum, s) => sum + s.eventos_sem_oculos, 0);
  const totalViolacoes     = totalSemCapacete + totalSemColete + totalSemLuvas + totalSemOculos;

  const avgRisk = sessions.length > 0
    ? formatPct(sessions.reduce((sum, s) => sum + normalizeRisk(Number(s.nivel_risco)), 0) / sessions.length)
    : "0";
  const maxPeak = sessions.length > 0
    ? formatPct(Math.max(...sessions.map((s) => normalizeRisk(Number(s.pico_risco)))))
    : "0";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <DashboardHeader
          onRefresh={handleRefresh}
          isLoading={isLoading}
          sessionCount={sessions.length}
        />

        {isError && (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Erro ao carregar dados. Verifique se o SafeView EPI está em execução.
          </div>
        )}

        {/* Stats Grid */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatsCard title="Inspeções" value={sessions.length} icon={Activity} />
          <StatsCard title="Tempo Total" value={formatTotalDuration(sessions)} icon={Clock} />
          <StatsCard title="Nível Risco" value={`${avgRisk}%`} icon={TrendingUp} variant={Number(avgRisk) > 50 ? "warning" : "default"} />
          <StatsCard title="Pico Risco" value={`${maxPeak}%`} icon={Zap} variant={Number(maxPeak) > 70 ? "destructive" : "warning"} />
          <StatsCard title="Total Alertas" value={totalAlerts} icon={AlertTriangle} variant={totalAlerts > 0 ? "warning" : "success"} />
          <StatsCard
            title="Violações EPI"
            value={totalViolacoes}
            subtitle={`${totalSemCapacete} cap · ${totalSemColete} col · ${totalSemLuvas} luv · ${totalSemOculos} óc`}
            icon={HardHat}
            variant={totalViolacoes > 0 ? "warning" : "success"}
          />
        </div>

        {/* Charts */}
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <RiskTrendChart sessions={sessions} />
          <EventsBarChart sessions={sessions} />
        </div>

        {/* Sessions Table */}
        <Card className="mt-6 border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Histórico de Inspeções
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <SessionsTable sessions={sessions} onDelete={handleDelete} />
          </CardContent>
        </Card>
      </div>

      {/* AI Chat */}
      <ChatWidget sessions={sessions} />

      {/* Footer de autoria */}
      <div style={{
        position: 'fixed', bottom: 8, right: 12,
        fontSize: 10, color: 'rgba(100,116,139,0.35)',
        userSelect: 'none', pointerEvents: 'none',
        letterSpacing: '0.04em', fontFamily: 'monospace',
        zIndex: 0,
      }}>
        SafeView EPI • build MD-01
      </div>
    </div>
  );
};

export default Index;
