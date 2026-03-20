// SafeView 4.0 - v49 | Feito por Gabriel Madureira em 14/03/2026
import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SessionRow {
  id: string;
  duracao_segundos: number;
  pico_fadiga: number;
  media_fadiga: number;
  total_alertas: number;
  eventos_olhos_fechados: number;
  eventos_bocejos: number;
  created_at: string;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

function normalizeFatigue(v: number): number {
  return v > 0 && v <= 1 ? v * 100 : v;
}

function getFatigueLabel(avg: number): string {
  const n = normalizeFatigue(avg);
  if (n < 30) return "Baixa";
  if (n < 60) return "Moderada";
  return "Alta";
}

export function exportSessionsReportPdf(sessions: SessionRow[], isFiltered: boolean) {
  const pdf = new jsPDF("l", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  let y = 15;

  pdf.setFontSize(16); pdf.setFont("helvetica", "bold"); pdf.setTextColor(33, 37, 41);
  pdf.text(isFiltered ? "SafeView - Relatório de Sessões (Filtrado)" : "SafeView - Relatório Geral de Sessões", margin, y);
  y += 7;
  pdf.setFontSize(9); pdf.setFont("helvetica", "normal"); pdf.setTextColor(108, 117, 125);
  pdf.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}  •  ${sessions.length} sessões`, margin, y);
  y += 8;

  const totalAlerts   = sessions.reduce((s, r) => s + r.total_alertas, 0);
  const totalEyes     = sessions.reduce((s, r) => s + r.eventos_olhos_fechados, 0);
  const totalYawns    = sessions.reduce((s, r) => s + r.eventos_bocejos, 0);
  const totalDuration = sessions.reduce((s, r) => s + r.duracao_segundos, 0);
  const avgFatigue    = sessions.length > 0 ? sessions.reduce((s, r) => s + normalizeFatigue(Number(r.media_fadiga)), 0) / sessions.length : 0;
  const maxPeak       = sessions.length > 0 ? Math.max(...sessions.map(r => normalizeFatigue(Number(r.pico_fadiga)))) : 0;

  pdf.setFontSize(10); pdf.setFont("helvetica", "bold"); pdf.setTextColor(33, 37, 41);
  pdf.text("Resumo", margin, y); y += 5;
  pdf.setFontSize(9); pdf.setFont("helvetica", "normal"); pdf.setTextColor(55, 65, 81);
  pdf.text(`Tempo Total: ${formatDuration(totalDuration)}   •   Média Fadiga: ${avgFatigue.toFixed(1)}%   •   Pico Máximo: ${maxPeak.toFixed(1)}%`, margin, y); y += 5;
  pdf.text(`Total Alertas: ${totalAlerts}   •   Olhos Fechados: ${totalEyes}   •   Bocejos: ${totalYawns}`, margin, y); y += 8;
  pdf.setDrawColor(200, 200, 200); pdf.line(margin, y, pageWidth - margin, y); y += 6;

  const cols = [
    { label: "Data", width: 42 }, { label: "Duração", width: 28 }, { label: "Nível", width: 24 },
    { label: "Média Fadiga", width: 30 }, { label: "Pico", width: 22 }, { label: "Alertas", width: 22 },
    { label: "Olhos Fech.", width: 26 }, { label: "Bocejos", width: 22 }, { label: "ID", width: 30 },
  ];

  function drawHeader() {
    pdf.setFillColor(240, 240, 240);
    const totalW = cols.reduce((s, c) => s + c.width, 0);
    pdf.rect(margin, y - 4, totalW, 6, "F");
    pdf.setFontSize(7.5); pdf.setFont("helvetica", "bold"); pdf.setTextColor(80, 80, 80);
    let x = margin;
    for (const col of cols) { pdf.text(col.label, x + 1, y); x += col.width; }
    y += 5;
  }

  drawHeader();
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8);

  for (const session of sessions) {
    if (y > pageHeight - 15) { pdf.addPage(); y = 15; drawHeader(); }
    const normMedia = normalizeFatigue(Number(session.media_fadiga));
    const normPico  = normalizeFatigue(Number(session.pico_fadiga));
    pdf.setTextColor(55, 65, 81);
    let x = margin;
    const rowData = [
      format(new Date(session.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
      formatDuration(session.duracao_segundos), getFatigueLabel(session.media_fadiga),
      `${normMedia.toFixed(1)}%`, `${normPico.toFixed(1)}%`, String(session.total_alertas),
      String(session.eventos_olhos_fechados), String(session.eventos_bocejos), session.id.slice(0, 8),
    ];
    for (let i = 0; i < rowData.length; i++) { pdf.text(rowData[i], x + 1, y); x += cols[i].width; }
    y += 5;
  }

  pdf.save(isFiltered ? "relatorio_sessoes_filtrado.pdf" : "relatorio_sessoes_geral.pdf");
}
