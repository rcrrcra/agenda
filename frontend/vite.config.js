import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `host: true` deixa o Vite acessível pela rede (celular: http://IP-DO-PC:5173).
// O proxy encaminha /api para o NestJS no próprio computador, então o celular só precisa da porta 5173.
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173, proxy: { "/api": "http://127.0.0.1:8000", "/media": "http://127.0.0.1:8000" } },
});
