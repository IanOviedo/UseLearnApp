// Tipos compartidos entre el servidor y el cliente.
// Antes vivían duplicados (cada componente definía su propia interfaz Pregunta).

/**
 * Fase C1 — modalidad de entrada de una sesión:
 * - `apunte`: el usuario pegó su propio texto (fidelidad estricta a ese texto).
 * - `tema_libre`: el usuario escribió un tema y la app genera el apunte de estudio.
 */
export type ModoSesion = "apunte" | "tema_libre" | "repaso";

/** Nivel que guía la profundidad del apunte sintético (modalidad tema libre). */
export type NivelSesion = "basico" | "intermedio" | "avanzado";

/**
 * Fase C2 — ruta que el plan asigna a cada sub-tema para la fase Enseñar/Practicar:
 * - `reforzar`: falló al menos una vez → enseñar (anclado al error) + practicar.
 * - `asegurar`: dominado sin errores pero con pocos intentos → repaso breve + practicar.
 * - `practicar`: dominado y con práctica suficiente → solo ejercicios.
 * - `sin_evaluar`: el sondeo nunca lo preguntó → enseñar desde cero + practicar.
 */
export type RutaSubtema = "reforzar" | "asegurar" | "practicar" | "sin_evaluar";

export interface BloqueRuta {
  subtemaId: number;
  nombre: string;
  ruta: RutaSubtema;
}

// --- Fase D — material de la fase Enseñar/Practicar --------------------------

/** Tipos de bloque de explicación. El modelo puede devolver otro: se normaliza al leer. */
export type TipoExplicacion = "que_es" | "como_se_usa" | "variaciones" | "mas_texto";

export interface Explicacion {
  id: number;
  subtemaId: number;
  orden: number;
  tipo: string;
  titulo: string;
  contenido: string;
  ejemplo: string | null;
}

/** Una condición de verificación: `test` es una expresión JS que debe evaluar a true. */
export interface AssertionEjercicio {
  descripcion: string;
  test: string;
}

export interface Ejercicio {
  id: number;
  subtemaId: number;
  orden: number;
  tipo: "codigo" | "quiz";
  /** "js" | "jsx" para código, "ninguno" para quiz. */
  lenguaje: string;
  /** Par del mismo problema en otro lenguaje (ej. "js" ↔ "jsx"). */
  variante: string | null;
  enunciado: string;
  /** Código inicial en el editor (ejercicios de código). */
  plantilla: string | null;
  assertions: AssertionEjercicio[];
  /** Preguntas de opción múltiple (ejercicios quiz). */
  opciones: string[] | null;
  indiceCorrecta: number | null;
  pista: string | null;
  solucion: string | null;
  dificultad: string;
}

export interface IntentoEjercicio {
  id: number;
  ejercicioId: number;
  codigo: string;
  aprobado: boolean;
  /** Salida del runner: logs + resultados por assertion (JSON serializado). */
  salida: string | null;
  creadoEn: string;
}

/** Conteo rápido por sub-tema para el sidebar de la fase Enseñar (Fase D). */
export interface ConteoAprendizaje {
  subtemaId: number;
  explicaciones: number;
  ejercicios: number;
  ejerciciosAprobados: number;
}

export interface Pregunta {
  pregunta: string;
  opciones: string[];
  indiceCorrecta: number;
  /**
   * Por qué la correcta lo es (1-2 frases, anclada al texto). El modelo la genera con
   * cada pregunta: es lo que hace que el sondeo enseñe en vez de solo evaluar.
   * Opcional porque las sesiones viejas guardaron el lote sin este campo.
   */
  explicacion?: string;
}

export interface SubtemaEstado {
  id: number;
  nombre: string;
  /**
   * Fragmento del material donde apareció el sub-tema (lo guarda la creación de la sesión).
   * Preguntas y material lo reutilizan para no volver a buscar el nombre en el texto completo,
   * que con textos largos suele fallar y cae al head del documento.
   */
  fragmento: string | null;
  aciertosSeguidos: number;
  intentos: number;
  correctas: number;
  incorrectas: number;
  cubierto: boolean;
  /**
   * El usuario pasó a otro sub-tema sin terminarlo. NO afecta el dominio ni el dominio del
   * ejercicio: solo la UI lo distingue de "pendiente" para no dejar un contador que nunca baja.
   */
  saltado: boolean;
}

/**
 * Fase memoria — un concepto que sobrevive entre sesiones. Es la fila de `conceptos`:
 * "Closures" en dos sesiones distintas apunta a un solo `ConceptoEstado`.
 */
export interface ConceptoEstado {
  id: number;
  nombre: string;
  vecesVisto: number;
  vecesAcierto: number;
  vecesFallo: number;
  ultimoResultado: boolean | null;
  /** Caja Leitner (1..3): sube con los aciertos y vuelve a 1 con un fallo. */
  caja: number;
  /** Fecha/hora ISO (SQLite) del próximo repaso; null = nunca programado. */
  proximoRepaso: string | null;
  primeraVez: string;
  ultimaVez: string;
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

/** Fase B.10 — una pregunta del lote con su id ya guardado: el cliente cachea el resto. */
export interface LoteItem {
  preguntaId: number;
  pregunta: Pregunta;
}

export interface EstadoSesion {
  id: number;
  tema: string;
  fase: "sondeo" | "plan" | "ensenar" | "cerrar";
  /** Modalidad con la que se creó la sesión (Fase C1). */
  modo: ModoSesion;
  /** Objetivo escrito en modo `tema_libre` (si lo había). */
  objetivo: string | null;
  modelo: string | null;
  creadaEn: string;
  feedback: string | null;
  progreso: ProgresoSondeo;
  subtemas: SubtemaEstado[];
  subtemasDebiles: string[];
  /** Sub-temas sin dominar (`cubierto = 0`): el plan los muestra como pendientes. */
  subtemasSinDominar: string[];
  /** Ruta por sub-tema calculada en el servidor (Fase C2): es lo que dice qué practicar. */
  rutas: BloqueRuta[];
  /** Conteos de material por sub-tema (Fase D): alimentan el sidebar de práctica. */
  aprendizaje: ConteoAprendizaje[];
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
