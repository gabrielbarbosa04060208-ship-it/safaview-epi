// SafeView EPI — App.tsx
// Clone do App.tsx do SafeView original com título e tag adaptados.
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { TitleBar } from "./components/TitleBar";

const queryClient = new QueryClient();

function AppBootstrap() {
  useEffect(() => {
    document.title = "SafeView EPI — Detector de EPIs";
    document.body.style.cssText += `
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    `;
  }, []);

  useEffect(() => {
    const el = document.createElement('div');
    el.id = 'sv-build-tag';
    el.textContent = 'SafeView EPI • build MD-1';
    Object.assign(el.style, {
      position: 'fixed', bottom: '8px', right: '12px',
      fontSize: '10px', color: 'rgba(148,163,184,0.30)',
      userSelect: 'none', pointerEvents: 'none',
      letterSpacing: '0.04em', fontFamily: 'monospace', zIndex: '0',
    });
    document.body.appendChild(el);
    return () => el.remove();
  }, []);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AppBootstrap />
      <TitleBar />
      <Toaster />
      <Sonner />
      <HashRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
