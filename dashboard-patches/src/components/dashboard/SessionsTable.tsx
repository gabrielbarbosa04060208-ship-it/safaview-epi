// SafeView EPI — v1
// SessionsTable.tsx — tabela de histórico de inspeções EPI
// Substitui o SessionsTable original que usa campos de fadiga

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Trash2, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// ── Tipo exportado — usado por useMonitoringSessions e ChatWidget ─────────────
export interface MonitoringSession {
  id:                     string;
  created_at:             string;
  duracao_segundos:       number;
  pico_risco:             number;
  nivel_risco:            number;
  total_alertas:          number;
  eventos_sem_capacete:   number;
  eventos_sem_colete:     number;
  eventos_sem_luvas:      number;
  eventos_sem_oculos:     number;
  nome_funcionario?:      string | null;
  local_trabalho?:        string | null;
  trabalho_realizado?:    string | null;
  informacoes_adicionais?: string | null;
}

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

function riskBadge(nivel: number) {
  const n = normalizeRisk(nivel);
  if (n < 30) return <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-green-500/15 text-green-400">Baixo</span>;
  if (n < 60) return <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-yellow-500/15 text-yellow-400">Moderado</span>;
  return          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-red-500/15 text-red-400">Alto</span>;
}

interface SessionsTableProps {
  sessions:  MonitoringSession[];
  onDelete?: (id: string) => void;
}

export function SessionsTable({ sessions, onDelete }: SessionsTableProps) {
  const navigate = useNavigate();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!onDelete) return;
    setDeletingId(id);
    try { await onDelete(id); }
    finally { setDeletingId(null); }
  };

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">Nenhuma inspeção registrada ainda.</p>
        <p className="text-xs mt-1 opacity-60">Inicie uma sessão no detector para registrar dados.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border/40">
            <TableHead className="text-xs">Data</TableHead>
            <TableHead className="text-xs">Duração</TableHead>
            <TableHead className="text-xs">Risco</TableHead>
            <TableHead className="text-xs text-center">Alertas</TableHead>
            <TableHead className="text-xs text-center">S/Capacete</TableHead>
            <TableHead className="text-xs text-center">S/Colete</TableHead>
            <TableHead className="text-xs text-center">S/Luvas</TableHead>
            <TableHead className="text-xs text-center">S/Óculos</TableHead>
            <TableHead className="text-xs">Funcionário</TableHead>
            <TableHead className="w-16"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((s) => (
            <TableRow
              key={s.id}
              className="cursor-pointer hover:bg-muted/40 border-border/30"
              onClick={() => navigate(`/session/${s.id}`)}
            >
              <TableCell className="text-xs text-muted-foreground">
                {format(new Date(s.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
              </TableCell>
              <TableCell className="text-xs font-mono">
                {formatDuration(s.duracao_segundos)}
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  {riskBadge(s.nivel_risco)}
                  <span className="text-[10px] text-muted-foreground">
                    {normalizeRisk(Number(s.nivel_risco)).toFixed(0)}% / pico {normalizeRisk(Number(s.pico_risco)).toFixed(0)}%
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-xs text-center font-semibold">
                {s.total_alertas > 0
                  ? <span className="text-orange-400">{s.total_alertas}</span>
                  : <span className="text-muted-foreground/40">0</span>}
              </TableCell>
              <TableCell className="text-xs text-center">
                {s.eventos_sem_capacete > 0
                  ? <span className="text-red-400 font-semibold">{s.eventos_sem_capacete}</span>
                  : <span className="text-muted-foreground/40">—</span>}
              </TableCell>
              <TableCell className="text-xs text-center">
                {s.eventos_sem_colete > 0
                  ? <span className="text-red-400 font-semibold">{s.eventos_sem_colete}</span>
                  : <span className="text-muted-foreground/40">—</span>}
              </TableCell>
              <TableCell className="text-xs text-center">
                {s.eventos_sem_luvas > 0
                  ? <span className="text-red-400 font-semibold">{s.eventos_sem_luvas}</span>
                  : <span className="text-muted-foreground/40">—</span>}
              </TableCell>
              <TableCell className="text-xs text-center">
                {s.eventos_sem_oculos > 0
                  ? <span className="text-red-400 font-semibold">{s.eventos_sem_oculos}</span>
                  : <span className="text-muted-foreground/40">—</span>}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                {s.nome_funcionario ?? <span className="opacity-30">—</span>}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {onDelete && (
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 text-muted-foreground/40 hover:text-destructive"
                      disabled={deletingId === s.id}
                      onClick={(e) => handleDelete(e, s.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                  <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
