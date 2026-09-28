export type ProveedorNube = {
  id: string;
  nombre: string;
  baseUrl: string;
  apiKey: string;
  formato: "openai" | "gemini-nativo";
};

const STORAGE_KEY = "proveedoresNube";

export function obtenerProveedores(): ProveedorNube[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
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

export function buscarProveedorPorNombreDeModelo(modelo: string): ProveedorNube | null {
  const proveedores = obtenerProveedores();
  const modeloLower = modelo.toLowerCase();
  
  const encontrado = proveedores.find((p) => 
    modeloLower.startsWith(p.nombre.toLowerCase())
  );
  
  return encontrado || null;
}
