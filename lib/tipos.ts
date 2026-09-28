// Tipos compartidos entre el servidor y el cliente.
// Antes vivían duplicados (cada componente definía su propia interfaz Pregunta).

export interface Pregunta {
  pregunta: string;
  opciones: string[];
  indiceCorrecta: number;
}

export interface SubtemaEstado {
  id: number;
  nombre: string;
  aciertosSeguidos: number;
  intentos: number;
  correctas: number;
  incorrectas: number;
  cubierto: boolean;
}

export interface ProgresoSondeo {
  respondidas: number;
  totalServibles: number;
  subtemasTotal: number;
  subtemasCubiertos: number;
}

export interface ItemHistorial {
  preguntaId: number;
  subtemaId: number;
  subtemaNombre: string;
  pregunta: Pregunta;
  opcionElegida: string | null;
  correcta: boolean;
}

export interface EstadoSesion {
  id: number;
  tema: string;
  fase: "sondeo" | "plan";
  modelo: string | null;
  creadaEn: string;
  feedback: string | null;
  progreso: ProgresoSondeo;
  subtemas: SubtemaEstado[];
  subtemasDebiles: string[];
  historial: ItemHistorial[];
}

/** Config del proveedor de nube tal como viaja del cliente al servidor (localStorage no existe en el server). */
export interface ProveedorPayload {
  nombre?: string | null;
  baseUrl?: string | null;
  apiKey?: string | null;
  formato?: string | null;
  modelo?: string | null;
}
