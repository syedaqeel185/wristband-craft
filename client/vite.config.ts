import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    allowedHosts: ["8080-icae5czratw5zee8hay6d-8f6b670d.manus.computer", "8081-icae5czratw5zee8hay6d-8f6b670d.manus.computer", "8082-icae5czratw5zee8hay6d-8f6b670d.manus.computer"],
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
