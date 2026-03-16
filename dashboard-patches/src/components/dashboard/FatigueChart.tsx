// SafeView EPI — v1
// FatigueChart.tsx — gráficos de tendência de risco EPI e eventos por sessão
// Substitui o FatigueChart original que usa campos de fadiga

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MonitoringSession } from "./SessionsTable";

function normalizeRisk(v: number): number {
  return v > 0 && v <= 1 ? v * 100 : v;
}

// ── Gráfico de tendência de risco (linha) ─────────────────────────────────────
export function FatigueTrendChart({ sessions }: { sessions: MonitoringSession[] }) {
  const data = [...sessions]
    .reverse()
    .slice(-20)
    .map((s) => ({
      date:  format(new Date(s.created_at), "dd/MM HH:mm", { locale: ptBR }),
      risco: Number(normalizeRisk(Number(s.nivel_risco)).toFixed(1)),
      pico:  Number(normalizeRisk(Number(s.pico_risco)).toFixed(1)),
    }));

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Tendência de Risco EPI
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,88%)" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="hsl(220,10%,60%)" interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(220,10%,60%)" domain={[0, 100]} unit="%" />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(220,15%,88%)", borderRadius: "8px", fontSize: 11 }}
                formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name === 'risco' ? 'Nível Médio' : 'Pico']}
              />
              <Line type="monotone" dataKey="risco" stroke="hsl(215,60%,50%)" strokeWidth={2} dot={false} name="risco" />
              <Line type="monotone" dataKey="pico"  stroke="hsl(0,65%,55%)"   strokeWidth={1.5} dot={false} name="pico" strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Gráfico de eventos por sessão (barras) ────────────────────────────────────
export function EventsBarChart({ sessions }: { sessions: MonitoringSession[] }) {
  const data = [
    { name: "S/ Capacete", value: sessions.reduce((s, r) => s + r.eventos_sem_capacete, 0), fill: "hsl(0,65%,50%)"   },
    { name: "S/ Colete",   value: sessions.reduce((s, r) => s + r.eventos_sem_colete,   0), fill: "hsl(25,80%,50%)"  },
    { name: "S/ Luvas",    value: sessions.reduce((s, r) => s + r.eventos_sem_luvas,    0), fill: "hsl(215,60%,50%)" },
    { name: "S/ Óculos",   value: sessions.reduce((s, r) => s + r.eventos_sem_oculos,   0), fill: "hsl(270,50%,55%)" },
    { name: "Alertas",     value: sessions.reduce((s, r) => s + r.total_alertas,         0), fill: "hsl(38,90%,50%)"  },
  ];

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Violações EPI por Tipo
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,88%)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(220,10%,60%)" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(220,10%,60%)" />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(220,15%,88%)", borderRadius: "8px", fontSize: 11 }}
                formatter={(v: number) => [v, "ocorrências"]}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
