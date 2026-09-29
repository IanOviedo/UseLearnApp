import type { ProveedorPayload } from "./tipos";

export type ProveedorNube = {
  id: string;
  nombre: string;
  baseUrl: string;
  apiKey: string;
  formato: "openai" | "gemini-nativo";
  /**
   * Modelo que se le pide a la API. Antes estaba hardcodeado a "openai/gpt-oss-120b",
   * así que todos los proveedores usaban ese modelo aunque ofrecieran uno más rápido.
   * Es opcional para no romper los proveedores ya guardados en localStorage.
   */
  modelo?: string;
};


const STORAGE_KEY = "proveedoresNube";

export function obtenerProveedores(): ProveedorNube[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function guardarProveedores(proveedores: ProveedorNube[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(proveedores));
  } catch (error) {
    console.error("Error saving proveedores to localStorage", error);
  }
}

export function agregarProveedor(datos: Omit<ProveedorNube, "id">): ProveedorNube {
  const proveedores = obtenerProveedores();
  const nuevoProveedor: ProveedorNube = {
    ...datos,
    id: crypto.randomUUID(),
  };
  proveedores.push(nuevoProveedor);
  guardarProveedores(proveedores);
  return nuevoProveedor;
}

export function eliminarProveedor(id: string): void {
  const proveedores = obtenerProveedores();
  const filtrados = proveedores.filter((p) => p.id !== id);
  guardarProveedores(filtrados);
}

/**
 * Arma un ProveedorNube a partir de los datos que llegan en una petición.
 * Necesario porque el servidor no puede leer localStorage: el cliente manda
 * la config del proveedor elegido en cada request.
 */
export function proveedorDesdeParams(datos: ProveedorPayload): ProveedorNube | undefined {
  const { nombre, baseUrl, apiKey, formato, modelo } = datos;

  if (!nombre || !baseUrl || !apiKey) return undefined;
  if (formato !== "openai" && formato !== "gemini-nativo") return undefined;

  return {
    id: "temporal",
    nombre,
    baseUrl,
    apiKey,
    formato,
    modelo: modelo || undefined,
  };
}

/**
 * Busca el proveedor que maneja un modelo dado su nombre (se identifican por prefijo),
 * o null si es un modelo local de Ollama o de Gemini nativo.
 */
export function proveedorDeModelo(
  proveedores: ProveedorNube[],
  nombreModelo: string
): ProveedorNube | null {
  const nombre = nombreModelo.toLowerCase();
  return proveedores.find((p) => nombre.startsWith(p.nombre.toLowerCase())) ?? null;
}

