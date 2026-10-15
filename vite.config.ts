import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Vercel serves the app from the domain root.
  base: "/",
  server: { host: "0.0.0.0" },
});
