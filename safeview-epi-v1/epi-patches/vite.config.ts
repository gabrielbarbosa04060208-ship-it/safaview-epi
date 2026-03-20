import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5175, // porta diferente do SafeView (5173) e Dashboard (5174)
  },
  // Exclui onnxruntime-web da pré-bundling — ele carrega WASM dinamicamente
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
});
