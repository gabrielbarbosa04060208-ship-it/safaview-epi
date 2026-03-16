// SafeView EPI — v1
// TitleBar.tsx — barra de título customizada (frame: false no Electron)
// Manual §6: paddingTop 28px + min-h-screen fix são OBRIGATÓRIOS com frame:false

import { useState, useEffect } from 'react';
import { Minus, Maximize2, Minimize2, X, HardHat } from 'lucide-react';

const TITLEBAR_H = 28; // px — altura da barra (h-7 = 28px)

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const api = (window as any).electronAPI;

  useEffect(() => {
    // ── CRÍTICO: sem isso o conteúdo fica escondido atrás da TitleBar ────────
    // Manual §6: paddingTop + min-h-screen fix
    document.body.style.paddingTop = `${TITLEBAR_H}px`;
    const style = document.createElement('style');
    style.id = 'titlebar-height-fix';
    style.textContent = `.min-h-screen { min-height: calc(100vh - ${TITLEBAR_H}px) !important; }`;
    document.head.appendChild(style);

    return () => {
      document.body.style.paddingTop = '';
      document.getElementById('titlebar-height-fix')?.remove();
    };
  }, []);

  useEffect(() => {
    if (!api?.isMaximized) return;
    api.isMaximized().then(setIsMaximized);

    // Debounce 100ms — IPC por pixel de resize trava o processo
    let debounce: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        if (api?.isMaximized) setIsMaximized(await api.isMaximized());
      }, 100);
    };
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(debounce); window.removeEventListener('resize', onResize); };
  }, []);

  const minimize = () => api?.windowControls?.minimize?.();
  const maximize = () => api?.windowControls?.maximizeToggle?.()?.then?.(setIsMaximized);
  const close    = () => api?.windowControls?.close?.();

  const DRAG:   React.CSSProperties = { WebkitAppRegion: 'drag'    } as any;
  const NODRAG: React.CSSProperties = { WebkitAppRegion: 'no-drag' } as any;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex h-7 items-center
                 justify-between bg-background/95 border-b border-border/40
                 px-3 backdrop-blur-sm select-none"
      style={DRAG}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80 font-medium">
        <HardHat className="h-3 w-3 text-primary" />
        SafeView EPI
      </div>

      <div className="flex items-center" style={NODRAG}>
        <button onClick={minimize}
          className="flex h-7 w-8 items-center justify-center text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground transition-colors"
          title="Minimizar">
          <Minus className="h-3 w-3" />
        </button>
        <button onClick={maximize}
          className="flex h-7 w-8 items-center justify-center text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground transition-colors"
          title={isMaximized ? 'Restaurar' : 'Maximizar'}>
          {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </button>
        <button onClick={close}
          className="flex h-7 w-8 items-center justify-center text-muted-foreground/60 hover:bg-red-600 hover:text-white transition-colors"
          title="Fechar">
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
