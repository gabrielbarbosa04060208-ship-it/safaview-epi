// SafeView EPI — v1 | Feito por Gabriel Madureira
import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SessionRow {
  id:                     string;
  duracao_segundos:       number;
  pico_risco:             number;
  nivel_risco:            number;
  total_alertas:          number;
  eventos_sem_capacete:   number;
  eventos_sem_colete:     number;
  eventos_sem_luvas:      number;
  eventos_sem_oculos:     number;
  created_at:             string;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

// Converte escala 0-1 para 0-100 caso o detector retorne valores decimais (ex: 0.45 → 45)
function normalizeRisk(v: number): number {
  return v > 0 && v <= 1 ? v * 100 : v;
}

function getRiskLabel(avg: number): string {
  const n = normalizeRisk(avg);
  if (n < 30) return "Baixo";
  if (n < 60) return "Moderado";
  return "Alto";
}

export function exportSessionsReportPdf(sessions: SessionRow[], isFiltered: boolean) {
  const pdf      = new jsPDF("l", "mm", "a4");
  const pageWidth  = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  let y = 15;

  // Título
  pdf.setFontSize(16);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(33, 37, 41);
  const title = isFiltered
    ? "SafeView EPI - Relatório de Inspeções (Filtrado)"
    : "SafeView EPI - Relatório Geral de Inspeções";
  pdf.text(title, margin, y);
  y += 7;

  // Data de geração
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(108, 117, 125);
  pdf.text(
    `Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}  •  ${sessions.length} inspeções`,
    margin, y
  );
  y += 8;

  // Estatísticas de resumo
  const totalAlerts       = sessions.reduce((s, r) => s + r.total_alertas, 0);
  const totalSemCapacete  = sessions.reduce((s, r) => s + r.eventos_sem_capacete, 0);
  const totalSemColete    = sessions.reduce((s, r) => s + r.eventos_sem_colete, 0);
  const totalSemLuvas     = sessions.reduce((s, r) => s + r.eventos_sem_luvas, 0);
  const totalSemOculos    = sessions.reduce((s, r) => s + r.eventos_sem_oculos, 0);
  const totalDuration     = sessions.reduce((s, r) => s + r.duracao_segundos, 0);
  const avgRisk = sessions.length > 0
    ? sessions.reduce((s, r) => s + normalizeRisk(Number(r.nivel_risco)), 0) / sessions.length
    : 0;
  const maxPeak = sessions.length > 0
    ? Math.max(...sessions.map(r => normalizeRisk(Number(r.pico_risco))))
    : 0;

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(33, 37, 41);
  pdf.text("Resumo", margin, y);
  y += 5;

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(55, 65, 81);
  const summaryLine1 = `Tempo Total: ${formatDuration(totalDuration)}   •   Nível Risco Médio: ${avgRisk.toFixed(1)}%   •   Pico Máximo: ${maxPeak.toFixed(1)}%`;
  const summaryLine2 = `Total Alertas: ${totalAlerts}   •   Sem Capacete: ${totalSemCapacete}   •   Sem Colete: ${totalSemColete}   •   Sem Luvas: ${totalSemLuvas}   •   Sem Óculos: ${totalSemOculos}`;
  pdf.text(summaryLine1, margin, y); y += 5;
  pdf.text(summaryLine2, margin, y); y += 8;

  pdf.setDrawColor(200, 200, 200);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 6;

  // Colunas da tabela
  const cols = [
    { label: "Data",          width: 38 },
    { label: "Duração",       width: 24 },
    { label: "Nível Risco",   width: 26 },
    { label: "Nível",         width: 22 },
    { label: "Pico",          width: 20 },
    { label: "Alertas",       width: 20 },
    { label: "S/ Capacete",   width: 26 },
    { label: "S/ Colete",     width: 22 },
    { label: "S/ Luvas",      width: 22 },
    { label: "S/ Óculos",     width: 22 },
  ];

  // Cabeçalho da tabela
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(33, 37, 41);
  let x = margin;
  for (const col of cols) {
    pdf.text(col.label, x, y);
    x += col.width;
  }
  y += 4;
  pdf.setDrawColor(180, 180, 180);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 4;

  // Linhas de dados
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);

  for (const row of sessions) {
    if (y > pageHeight - 16) {
      pdf.addPage();
      y = 16;
    }

    const normNivel = normalizeRisk(Number(row.nivel_risco));
    const normPico  = normalizeRisk(Number(row.pico_risco));

    const cells = [
      format(new Date(row.created_at), "dd/MM/yy HH:mm", { locale: ptBR }),
      formatDuration(row.duracao_segundos),
      getRiskLabel(normNivel),
      `${normNivel.toFixed(1)}%`,
      `${normPico.toFixed(1)}%`,
      String(row.total_alertas),
      String(row.eventos_sem_capacete),
      String(row.eventos_sem_colete),
      String(row.eventos_sem_luvas),
      String(row.eventos_sem_oculos),
    ];

    // Cor alternada por nível de risco
    const riskN = normNivel;
    if (riskN >= 60) {
      pdf.setTextColor(180, 30, 30);
    } else if (riskN >= 30) {
      pdf.setTextColor(160, 100, 0);
    } else {
      pdf.setTextColor(55, 65, 81);
    }

    x = margin;
    for (let i = 0; i < cols.length; i++) {
      pdf.text(cells[i], x, y);
      x += cols[i].width;
    }
    y += 6;
  }

  pdf.save(`relatorio_epi_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
}
