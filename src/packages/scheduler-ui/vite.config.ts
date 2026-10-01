import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  root: "harness",
  server: {
    // PORT comes from the editor preview's port assignment; the
    // 5184 default keeps normal `npm run dev` (and the solver CORS
    // allow-list) unchanged.
    port: Number(process.env.PORT) || 5184,
    strictPort: true,
  },
});
