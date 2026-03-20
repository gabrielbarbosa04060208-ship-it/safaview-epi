// SafeView 4.0 - v49 | Feito por Gabriel Madureira em 14/03/2026
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
    document.title = "SafeView 4.0 — Detector de Fadiga";
    document.body.style.cssText += `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility;`;
    function purgeLovable(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);
      for (const node of nodes) {
        if (/lovable/i.test(node.textContent || "")) {
          node.textContent = (node.textContent || "")
            .replace(/\s*[-–—·|]\s*lovable(\s+app)?/gi, "")
            .replace(/lovable(\s+app)?\s*[-–—·|]\s*/gi, "")
            .replace(/lovable(\s+app)?/gi, "")
            .trim();
        }
      }
    }
    purgeLovable(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) m.addedNodes.forEach((node) => { if (node.nodeType === Node.ELEMENT_NODE) purgeLovable(node); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = document.createElement("div");
    el.id = "sv-build-tag";
    el.textContent = "SafeView • build MD-49";
    Object.assign(el.style, { position: "fixed", bottom: "8px", right: "12px", fontSize: "10px", color: "rgba(148,163,184,0.30)", userSelect: "none", pointerEvents: "none", letterSpacing: "0.04em", fontFamily: "monospace", zIndex: "0" });
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
