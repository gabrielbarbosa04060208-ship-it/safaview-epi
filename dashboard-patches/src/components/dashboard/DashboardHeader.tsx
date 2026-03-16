// SafeView EPI — v1
// DashboardHeader.tsx — cabeçalho do dashboard com título EPI

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardHeaderProps {
  onRefresh:    () => void;
  isLoading:    boolean;
  sessionCount: number;
}

export function DashboardHeader({ onRefresh, isLoading, sessionCount }: DashboardHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {/* Ícone shield EPI */}
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-primary" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6l-8-4z" strokeLinejoin="round"/>
            <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            SafeView EPI Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            {sessionCount} {sessionCount === 1 ? 'inspeção registrada' : 'inspeções registradas'}
          </p>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={isLoading}
        className="gap-2"
      >
        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        Atualizar
      </Button>
    </div>
  );
}
