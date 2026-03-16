// SafeView EPI — v1 | Feito por Gabriel Madureira
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Download, Clock, TrendingUp, Zap, AlertTriangle, Activity, HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { localApi } from "@/integrations/supabase/client-local";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

function normalizeRisk(v: number): number {
  return v > 0 && v <= 1 ? v * 100 : v;
}

function getRiskLabel(avg: number): { text: string; className: string } {
  const n = normalizeRisk(avg);
  if (n < 30) return { text: "Risco Baixo",     className: "bg-green-100 text-green-800 border-green-200" };
  if (n < 60) return { text: "Risco Moderado",  className: "bg-yellow-100 text-yellow-800 border-yellow-200" };
  return             { text: "Risco Alto",       className: "bg-red-100 text-red-800 border-red-200" };
}

const SessionDetail = () => {
  const { id }      = useParams<{ id: string }>();
  const navigate    = useNavigate();
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false); // guard síncrono contra double-click
  const chartRiskRef   = useRef<HTMLDivElement>(null);
  const chartEventsRef = useRef<HTMLDivElement>(null);

  const { data: session, isLoading } = useQuery({
    queryKey: ["session", id],
    queryFn: () => localApi.sessions.get(id!),
    enabled: !!id,
  });

  const handleExportPdf = async () => {
    // Guard síncrono — useState não bloqueia double-click pois re-render é assíncrono
    if (exportingRef.current || !session) return;
    exportingRef.current = true;
    setExporting(true);

    try {
      const pdf = new jsPDF("p", "mm", "a4");
      const W   = pdf.internal.pageSize.getWidth();
      const mar = 14;
      let y = 16;

      // ── Cabeçalho ─────────────────────────────────────────────────────────
      pdf.setFontSize(16);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(33, 37, 41);
      pdf.text("SafeView EPI — Relatório de Inspeção", mar, y);
      y += 7;

      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(108, 117, 125);
      pdf.text(
        `Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
        mar, y
      );
      y += 5;
      pdf.text(
        `Inspeção: ${session.id.slice(0, 8)} • ${format(new Date(session.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}`,
        mar, y
      );
      y += 3;
      pdf.setDrawColor(200, 200, 200);
      pdf.line(mar, y, W - mar, y);
      y += 8;

      // ── Informações do Trabalho (se preenchidas) ───────────────────────────
      const hasInfo = session.nome_funcionario || session.local_trabalho || session.trabalho_realizado;
      if (hasInfo) {
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(33, 37, 41);
        pdf.text("Informações do Trabalho", mar, y);
        y += 6;

        pdf.setFontSize(10);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(55, 65, 81);
        if (session.nome_funcionario)  { pdf.text(`Funcionário: ${session.nome_funcionario}`,  mar, y); y += 5; }
        if (session.trabalho_realizado){ pdf.text(`Trabalho: ${session.trabalho_realizado}`,    mar, y); y += 5; }
        if (session.local_trabalho)    { pdf.text(`Local: ${session.local_trabalho}`,           mar, y); y += 5; }
        if (session.informacoes_adicionais) {
          const lines = pdf.splitTextToSize(`Obs: ${session.informacoes_adicionais}`, W - mar * 2);
          for (const line of lines) {
            if (y + 5 > 270) { pdf.addPage(); y = 16; }
            pdf.text(line, mar, y);
            y += 5;
          }
        }
        y += 2;
        pdf.setDrawColor(200, 200, 200);
        pdf.line(mar, y, W - mar, y);
        y += 6;
      }

      // ── Estatísticas ───────────────────────────────────────────────────────
      const normNivel = normalizeRisk(Number(session.nivel_risco));
      const normPico  = normalizeRisk(Number(session.pico_risco));

      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(33, 37, 41);
      pdf.text("Estatísticas da Inspeção", mar, y);
      y += 7;

      const stats = [
        ["Duração:",               formatDuration(session.duracao_segundos)],
        ["Pico de Risco:",         `${normPico.toFixed(1)}%`],
        ["Sem Capacete:",          String(session.eventos_sem_capacete)],
        ["Nível de Risco Médio:",  `${normNivel.toFixed(1)}%`],
        ["Total de Alertas:",      String(session.total_alertas)],
        ["Sem Colete:",            String(session.eventos_sem_colete)],
        ["Sem Luvas:",             String(session.eventos_sem_luvas)],
        ["Sem Óculos:",            String(session.eventos_sem_oculos)],
      ];

      pdf.setFontSize(10);
      const colW = (W - mar * 2) / 2;
      stats.forEach(([label, value], idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const lx  = mar + col * colW;
        const ly  = y + row * 7;
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(80, 80, 80);
        pdf.text(label, lx, ly);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(33, 37, 41);
        pdf.text(value, lx + 50, ly);
      });
      y += Math.ceil(stats.length / 2) * 7 + 6;

      pdf.setDrawColor(200, 200, 200);
      pdf.line(mar, y, W - mar, y);
      y += 6;

      // ── Capturas dos gráficos via html2canvas ──────────────────────────────
      const chartOpts = { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false };
      const chartAreaW = (W - mar * 2 - 6) / 2;
      const chartH     = 60;

      if (chartRiskRef.current && chartEventsRef.current) {
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(80, 80, 80);
        pdf.text("NÍVEL DE RISCO", mar, y);
        pdf.text("VIOLAÇÕES EPI DETECTADAS", mar + chartAreaW + 6, y);
        y += 3;

        const [canvasRisk, canvasEvents] = await Promise.all([
          html2canvas(chartRiskRef.current,   chartOpts),
          html2canvas(chartEventsRef.current, chartOpts),
        ]);

        pdf.addImage(canvasRisk.toDataURL("image/png"),   "PNG", mar,                  y, chartAreaW, chartH);
        pdf.addImage(canvasEvents.toDataURL("image/png"), "PNG", mar + chartAreaW + 6, y, chartAreaW, chartH);
        y += chartH + 4;
      }

      const nomePart = (session.nome_funcionario || "inspecao").replace(/\s+/g, "_");
      pdf.save(`inspecao_${nomePart}_${session.id.slice(0, 8)}.pdf`);
      toast.success("PDF exportado com sucesso!");
    } catch (err) {
      console.error("Erro ao exportar PDF:", err);
      toast.error("Erro ao gerar PDF. Tente novamente.");
    } finally {
      setExporting(false);
      exportingRef.current = false;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Carregando inspeção...</div>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Inspeção não encontrada.</p>
        <Button variant="outline" onClick={() => navigate("/")}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
      </div>
    );
  }

  const risk       = getRiskLabel(normalizeRisk(session.nivel_risco));
  const eventsData = [
    { name: "Sem Capacete", value: session.eventos_sem_capacete, fill: "hsl(0, 70%, 45%)"    },
    { name: "Sem Colete",   value: session.eventos_sem_colete,   fill: "hsl(30, 85%, 50%)"   },
    { name: "Sem Luvas",    value: session.eventos_sem_luvas,    fill: "hsl(215, 60%, 40%)"  },
    { name: "Sem Óculos",   value: session.eventos_sem_oculos,   fill: "hsl(270, 50%, 50%)"  },
    { name: "Alertas",      value: session.total_alertas,        fill: "hsl(38, 92%, 50%)"   },
  ];
  const riskComparisonData = [
    { name: "Médio", value: normalizeRisk(Number(session.nivel_risco)), fill: "hsl(215, 60%, 28%)" },
    { name: "Pico",  value: normalizeRisk(Number(session.pico_risco)),  fill: "hsl(0, 65%, 50%)"   },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground tracking-tight truncate">
              Inspeção {session.id.slice(0, 8)}
            </h1>
            <p className="text-sm text-muted-foreground">
              {format(new Date(session.created_at), "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: ptBR })}
            </p>
          </div>
          <Badge className={risk.className}>{risk.text}</Badge>
          <Button onClick={handleExportPdf} disabled={exporting} size="sm" variant="outline">
            <Download className="mr-2 h-4 w-4" />
            {exporting ? "Exportando..." : "Exportar PDF"}
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6 mb-6">
          {[
            { icon: Clock,         label: "Duração",         value: formatDuration(session.duracao_segundos) },
            { icon: TrendingUp,    label: "Nível Risco",     value: `${normalizeRisk(Number(session.nivel_risco)).toFixed(1)}%` },
            { icon: Zap,           label: "Pico Risco",      value: `${normalizeRisk(Number(session.pico_risco)).toFixed(1)}%` },
            { icon: AlertTriangle, label: "Alertas",         value: session.total_alertas },
            { icon: HardHat,       label: "Sem Capacete",    value: session.eventos_sem_capacete },
            { icon: Activity,      label: "Sem Colete",      value: session.eventos_sem_colete },
          ].map(({ icon: Icon, label, value }) => (
            <Card key={label} className="border-border/60 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p className="text-lg font-bold text-foreground">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-2 mb-6">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Nível de Risco</CardTitle>
            </CardHeader>
            <CardContent>
              <div ref={chartRiskRef} className="h-[260px] bg-card">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={riskComparisonData} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 48%)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 48%)" domain={[0, 100]} unit="%" />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(220,15%,88%)", borderRadius: "8px", fontSize: 12 }} formatter={(v: number) => [`${v.toFixed(1)}%`, ""]} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                      {riskComparisonData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Violações EPI Detectadas</CardTitle>
            </CardHeader>
            <CardContent>
              <div ref={chartEventsRef} className="h-[260px] bg-card">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={eventsData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 48%)" />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 48%)" width={110} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(220,15%,88%)", borderRadius: "8px", fontSize: 12 }} />
                    <Bar dataKey="value" name="Quantidade" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                      {eventsData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SessionDetail;
