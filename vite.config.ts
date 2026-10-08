import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

Object.assign(process.env, { ...loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), ""), ...process.env });

export default defineConfig({
  tanstackStart: { server: { entry: "server" } },
  vite: { server: { host: "0.0.0.0", port: 5000, strictPort: true, allowedHosts: true } },
});
