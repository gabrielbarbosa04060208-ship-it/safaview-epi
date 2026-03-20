// SafeView 4.0 - v49 | Feito por Gabriel Madureira em 14/03/2026
import { Activity, AlertTriangle, Clock, Eye, TrendingUp, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { SessionsTable } from "@/components/dashboard/SessionsTable";
import { FatigueTrendChart, EventsBarChart } from "@/components/dashboard/FatigueChart";
import { ChatWidget } from "@/components/dashboard/ChatWidget";
import { useMonitoringSessions } from "@/hooks/useMonitoringSessions";
import { useQueryClient } from "@tanstack/react-query";
import { localApi } from "@/integrations/supabase/client-local";
import { toast } from "sonner";

function normalizeFatigue(v: number): number {
  return v > 0 && v <= 1 ? v * 100 : v;
}
function formatPct(v: number): string {
  const n = normalizeFatigue(v);
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

  const handleRefresh = () => { queryClient.invalidateQueries({ queryKey: ["sessoes_de_monitoramento"] }); };
  const handleDelete = async (id: string) => {
    try {
      await localApi.sessions.delete(id);
      toast.success("Sessão excluída com sucesso");
      queryClient.invalidateQueries({ queryKey: ["sessoes_de_monitoramento"] });
    } catch { toast.error("Erro ao excluir sessão."); }
  };

  const totalAlerts     = sessions.reduce((sum, s) => sum + s.total_alertas, 0);
  const totalEyesClosed = sessions.reduce((sum, s) => sum + s.eventos_olhos_fechados, 0);
  const totalYawns      = sessions.reduce((sum, s) => sum + s.eventos_bocejos, 0);
  const avgFatigue = sessions.length > 0
    ? formatPct(sessions.reduce((sum, s) => sum + normalizeFatigue(Number(s.media_fadiga)), 0) / sessions.length)
    : "0";
  const maxPeak = sessions.length > 0
    ? formatPct(Math.max(...sessions.map((s) => normalizeFatigue(Number(s.pico_fadiga)))))
    : "0";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <DashboardHeader onRefresh={handleRefresh} isLoading={isLoading} sessionCount={sessions.length} />
        {isError && (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Erro ao carregar dados. Verifique se o SafeView está em execução.
          </div>
        )}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatsCard title="Sessões" value={sessions.length} icon={Activity} />
          <StatsCard title="Tempo Total" value={formatTotalDuration(sessions)} icon={Clock} />
          <StatsCard title="Média Fadiga" value={`${avgFatigue}%`} icon={TrendingUp} variant={Number(avgFatigue) > 50 ? "warning" : "default"} />
          <StatsCard title="Pico Máximo" value={`${maxPeak}%`} icon={Zap} variant={Number(maxPeak) > 70 ? "destructive" : "warning"} />
          <StatsCard title="Total Alertas" value={totalAlerts} icon={AlertTriangle} variant={totalAlerts > 0 ? "warning" : "success"} />
          <StatsCard title="Olhos/Bocejos" value={totalEyesClosed + totalYawns} subtitle={`${totalEyesClosed} olhos · ${totalYawns} bocejos`} icon={Eye} variant="default" />
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <FatigueTrendChart sessions={sessions} />
          <EventsBarChart sessions={sessions} />
        </div>
        <Card className="mt-6 border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Histórico de Sessões</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <SessionsTable sessions={sessions} onDelete={handleDelete} />
          </CardContent>
        </Card>
      </div>
      <ChatWidget sessions={sessions} />
      <div style={{ position: "fixed", bottom: 8, right: 12, fontSize: 10, color: "rgba(100,116,139,0.35)", userSelect: "none", pointerEvents: "none", letterSpacing: "0.04em", fontFamily: "monospace", zIndex: 0 }}>
        SafeView • build MD-49
      </div>
    </div>
  );
};

export default Index;
