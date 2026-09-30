// Config de modelos del lado del CLIENTE (Ajustes).
// El servidor no puede leer localStorage, así que cada pantalla que dispara una llamada
// al modelo manda esta config en el body/query. Vive acá y no en `lib/config.ts` para
// que ese archivo siga siendo importable desde el server sin tocar APIs del navegador.

import { proveedorDeModelo, type ProveedorNube } from "./proveedores";

export interface ConfigLocal {
  modeloPreguntas: string;
  modeloPrincipal: string;
  proveedorPreguntas: ProveedorNube | null;
  proveedorPrincipal: ProveedorNube | null;
  /** Fase B.11 — el usuario puede apagar la pre-generación desde Ajustes. */
  pregen: boolean;
}

/** Lee toda la config del localStorage en un solo lugar. */
export function leerConfigLocal(): ConfigLocal {
  const modeloPreguntas = localStorage.getItem("uselearn:modeloPreguntas") ?? "";
  const modeloPrincipal = localStorage.getItem("uselearn:modeloPrincipal") ?? "";
  let proveedores: ProveedorNube[] = [];
  try {
    proveedores = JSON.parse(localStorage.getItem("proveedoresNube") ?? "[]") as ProveedorNube[];
  } catch {
    proveedores = [];
  }
  return {
    modeloPreguntas,
    modeloPrincipal,
    proveedorPreguntas: proveedorDeModelo(proveedores, modeloPreguntas),
    proveedorPrincipal: proveedorDeModelo(proveedores, modeloPrincipal),
    pregen: localStorage.getItem("uselearn:pregen") !== "0",
  };
}
