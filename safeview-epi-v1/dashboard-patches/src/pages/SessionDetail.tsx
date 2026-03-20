// SafeView 4.0 - v49 | Feito por Gabriel Madureira em 14/03/2026
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { localApi } from "@/integrations/supabase/client-local";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Activity, AlertTriangle, Eye, TrendingUp, Zap, Clock, FileDown } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  if (h > 0) return `${h}h ${m}min ${s}s`; if (m > 0) return `${m}min ${s}s`; return `${s}s`;
}
function getFatigueLabel(avg: number) {
  if (avg < 30) return { text: "Baixa",    className: "bg-success text-success-foreground border-0" };
  if (avg < 60) return { text: "Moderada", className: "bg-warning text-warning-foreground border-0" };
  return             { text: "Alta",      className: "bg-destructive text-destructive-foreground border-0" };
}
function normalizeFatigue(v: number): number { return v > 0 && v <= 1 ? v * 100 : v; }

const SessionDetail = () => {
  const { id } = useParams<{ id: string }>(); const navigate = useNavigate(); const queryClient = useQueryClient();
  const [nome, setNome] = useState(""); const [trabalho, setTrabalho] = useState("");
  const [local, setLocal] = useState(""); const [info, setInfo] = useState("");
  const [saving, setSaving] = useState(false); const [exporting, setExporting] = useState(false);
  const chartFatigueRef = useRef<HTMLDivElement>(null); const chartEventsRef = useRef<HTMLDivElement>(null);
  const exportingRef = useRef(false); const savingRef = useRef(false);

  const { data: session, isLoading } = useQuery({ queryKey: ["session_detail", id], queryFn: () => localApi.sessions.get(id!), enabled: !!id });

  useEffect(() => {
    if (session) { setNome(session.nome_funcionario || ""); setTrabalho(session.trabalho_realizado || ""); setLocal(session.local_trabalho || ""); setInfo(session.informacoes_adicionais || ""); }
  }, [session]);

  const handleSave = async () => {
    if (!id || !session || savingRef.current) return; savingRef.current = true; setSaving(true);
    try { await localApi.sessions.update(id, { nome_funcionario: nome || null, trabalho_realizado: trabalho || null, local_trabalho: local || null, informacoes_adicionais: info || null }); toast.success("Informações salvas com sucesso"); queryClient.invalidateQueries({ queryKey: ["session_detail", id] }); }
    catch { toast.error("Erro ao salvar informações"); } finally { setSaving(false); savingRef.current = false; }
  };

  const handleExportPdf = async () => {
    if (!session || exportingRef.current) return; exportingRef.current = true; setExporting(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
      const pdf = new jsPDF("p", "mm", "a4"); const W = pdf.internal.pageSize.getWidth(); const mar = 14; let y = 16;
      pdf.setFontSize(18); pdf.setFont("helvetica", "bold"); pdf.setTextColor(15, 30, 65); pdf.text("SafeView - Relatório de Sessão", mar, y); y += 8;
      pdf.setFontSize(9); pdf.setFont("helvetica", "normal"); pdf.setTextColor(100, 100, 100);
      pdf.text(`Sessão: ${session.id.slice(0, 8)}  •  ${format(new Date(session.created_at), "dd/MM/yyyy, HH:mm:ss", { locale: ptBR })}`, mar, y); y += 2;
      pdf.setDrawColor(200, 200, 200); pdf.line(mar, y + 2, W - mar, y + 2); y += 8;
      if (session.nome_funcionario || session.local_trabalho || session.trabalho_realizado) {
        pdf.setFontSize(12); pdf.setFont("helvetica", "bold"); pdf.setTextColor(33, 37, 41); pdf.text("Informações do Trabalho", mar, y); y += 6;
        pdf.setFontSize(10); pdf.setFont("helvetica", "normal"); pdf.setTextColor(55, 65, 81);
        if (session.nome_funcionario)   { pdf.text(`Funcionário: ${session.nome_funcionario}`,  mar, y); y += 5; }
        if (session.trabalho_realizado) { pdf.text(`Trabalho: ${session.trabalho_realizado}`,   mar, y); y += 5; }
        if (session.local_trabalho)     { pdf.text(`Local: ${session.local_trabalho}`,          mar, y); y += 5; }
        if (session.informacoes_adicionais) { const lines = pdf.splitTextToSize(`Obs: ${session.informacoes_adicionais}`, W - mar * 2); for (const line of lines) { if (y + 5 > 270) { pdf.addPage(); y = 16; } pdf.text(line, mar, y); y += 5; } }
        y += 2; pdf.setDrawColor(200, 200, 200); pdf.line(mar, y, W - mar, y); y += 6;
      }
      const normMedia = normalizeFatigue(Number(session.media_fadiga)); const normPico = normalizeFatigue(Number(session.pico_fadiga));
      pdf.setFontSize(12); pdf.setFont("helvetica", "bold"); pdf.setTextColor(33, 37, 41); pdf.text("Estatísticas da Sessão", mar, y); y += 7;
      const stats = [["Duração:", formatDuration(session.duracao_segundos)], ["Pico de Fadiga:", `${normPico.toFixed(1)}%`], ["Eventos Olhos Fechados:", String(session.eventos_olhos_fechados)], ["Média de Fadiga:", `${normMedia.toFixed(1)}%`], ["Total de Alertas:", String(session.total_alertas)], ["Eventos de Bocejos:", String(session.eventos_bocejos)]];
      pdf.setFontSize(10); const colW = (W - mar * 2) / 2;
      stats.forEach(([label, value], idx) => { const col = idx % 2, row = Math.floor(idx / 2), lx = mar + col * colW, ly = y + row * 7; pdf.setFont("helvetica", "normal"); pdf.setTextColor(80, 80, 80); pdf.text(label, lx, ly); pdf.setFont("helvetica", "bold"); pdf.setTextColor(33, 37, 41); pdf.text(value, lx + 50, ly); });
      y += Math.ceil(stats.length / 2) * 7 + 6; pdf.setDrawColor(200, 200, 200); pdf.line(mar, y, W - mar, y); y += 6;
      const chartOpts = { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false }; const chartAreaW = (W - mar * 2 - 6) / 2; const chartH = 60;
      if (chartFatigueRef.current && chartEventsRef.current) {
        pdf.setFontSize(8); pdf.setFont("helvetica", "bold"); pdf.setTextColor(80, 80, 80); pdf.text("NÍVEL DE FADIGA", mar, y); pdf.text("EVENTOS DETECTADOS", mar + chartAreaW + 6, y); y += 3;
        const [canvasFatigue, canvasEvents] = await Promise.all([html2canvas(chartFatigueRef.current, chartOpts), html2canvas(chartEventsRef.current, chartOpts)]);
        pdf.addImage(canvasFatigue.toDataURL("image/png"), "PNG", mar, y, chartAreaW, chartH); pdf.addImage(canvasEvents.toDataURL("image/png"), "PNG", mar + chartAreaW + 6, y, chartAreaW, chartH); y += chartH + 4;
      }
      pdf.save(`sessao_${(session.nome_funcionario || "sessao").replace(/\s+/g, "_")}_${session.id.slice(0, 8)}.pdf`); toast.success("PDF exportado com sucesso!");
    } catch (err) { console.error("Erro ao exportar PDF:", err); toast.error("Erro ao gerar PDF. Tente novamente."); }
    finally { setExporting(false); exportingRef.current = false; }
  };

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Carregando sessão...</div></div>;
  if (!session) return <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4"><p className="text-muted-foreground">Sessão não encontrada.</p><Button variant="outline" onClick={() => navigate("/")}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button></div>;

  const fatigue = getFatigueLabel(normalizeFatigue(session.media_fadiga));
  const eventsData = [{ name: "Olhos Fechados", value: session.eventos_olhos_fechados, fill: "hsl(215, 60%, 28%)" }, { name: "Bocejos", value: session.eventos_bocejos, fill: "hsl(190, 60%, 40%)" }, { name: "Alertas", value: session.total_alertas, fill: "hsl(38, 92%, 50%)" }];
  const fatigueData = [{ name: "Média", value: normalizeFatigue(Number(session.media_fadiga)), fill: "hsl(215, 60%, 28%)" }, { name: "Pico", value: normalizeFatigue(Number(session.pico_fadiga)), fill: "hsl(0, 65%, 50%)" }];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="shrink-0"><ArrowLeft className="h-5 w-5" /></Button>
          <div className="flex-1 min-w-0"><h1 className="text-xl font-bold text-foreground tracking-tight truncate">Sessão {session.id.slice(0, 8)}</h1><p className="text-sm text-muted-foreground">{format(new Date(session.created_at), "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: ptBR })}</p></div>
          <Badge className={fatigue.className}>{fatigue.text}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6 mb-6">
          {[{ icon: Clock, label: "Duração", value: formatDuration(session.duracao_segundos) }, { icon: TrendingUp, label: "Média Fadiga", value: `${normalizeFatigue(Number(session.media_fadiga)).toFixed(1)}%` }, { icon: Zap, label: "Pico Fadiga", value: `${normalizeFatigue(Number(session.pico_fadiga)).toFixed(1)}%` }, { icon: AlertTriangle, label: "Alertas", value: session.total_alertas }, { icon: Eye, label: "Olhos Fechados", value: session.eventos_olhos_fechados }, { icon: Activity, label: "Bocejos", value: session.eventos_bocejos }].map(({ icon: Icon, label, value }) => (
            <Card key={label} className="border-border/60 shadow-sm"><CardContent className="p-4 flex items-center gap-3"><Icon className="h-5 w-5 text-muted-foreground shrink-0" /><div><p className="text-xs text-muted-foreground font-medium">{label}</p><p className="text-lg font-bold text-foreground">{value}</p></div></CardContent></Card>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2 mb-6">
          <Card className="border-border/60 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Nível de Fadiga</CardTitle></CardHeader><CardContent><div ref={chartFatigueRef} className="h-[260px] bg-card"><ResponsiveContainer width="100%" height="100%"><BarChart data={fatigueData} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" /><XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 48%)" /><YAxis tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 48%)" domain={[0, 100]} unit="%" /><Tooltip contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(220,15%,88%)", borderRadius: "8px", fontSize: 12 }} formatter={(v: number) => [`${v.toFixed(1)}%`, ""]} /><Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={false}>{fatigueData.map((e, i) => <Cell key={i} fill={e.fill} />)}</Bar></BarChart></ResponsiveContainer></div></CardContent></Card>
          <Card className="border-border/60 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Eventos Detectados</CardTitle></CardHeader><CardContent><div ref={chartEventsRef} className="h-[260px] bg-card"><ResponsiveContainer width="100%" height="100%"><BarChart data={eventsData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" /><XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 48%)" /><YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 48%)" width={110} /><Tooltip contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(220,15%,88%)", borderRadius: "8px", fontSize: 12 }} /><Bar dataKey="value" name="Quantidade" radius={[0, 6, 6, 0]} isAnimationActive={false}>{eventsData.map((e, i) => <Cell key={i} fill={e.fill} />)}</Bar></BarChart></ResponsiveContainer></div></CardContent></Card>
        </div>
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Informações da Sessão de Trabalho</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="nome">Nome do Funcionário</Label><Input id="nome" placeholder="Ex: João Silva" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="trabalho">Trabalho Realizado</Label><Input id="trabalho" placeholder="Ex: Operação de empilhadeira" value={trabalho} onChange={(e) => setTrabalho(e.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="local">Local do Trabalho</Label><Input id="local" placeholder="Ex: Galpão 3 - Setor B" value={local} onChange={(e) => setLocal(e.target.value)} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="info">Informações Adicionais</Label><Textarea id="info" placeholder="Observações sobre a sessão..." value={info} onChange={(e) => setInfo(e.target.value)} rows={3} /></div>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <Button variant="outline" onClick={handleExportPdf} disabled={exporting} className="gap-2"><FileDown className="h-4 w-4" />{exporting ? "Gerando PDF..." : "Exportar PDF"}</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2"><Save className="h-4 w-4" />{saving ? "Salvando..." : "Salvar Informações"}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SessionDetail;
