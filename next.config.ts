import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  // Los humos end-to-end necesitan su propio dev server, y `next dev` no permite dos
  // instancias sobre el mismo directorio (el lock vive en `<distDir>/lock`). Con
  // USELEARN_DIST_DIR el server de prueba trabaja en `.next-smoke` mientras el server de
  // desarrollo de siempre sigue con `.next`, sin pisarse.
  distDir: process.env.USELEARN_DIST_DIR || ".next",
};

export default nextConfig;