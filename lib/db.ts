import path from "node:path";
import Database from "better-sqlite3";
import { ACIERTOS_SEGUIDOS_PARA_DOMINAR } from "./config";
import { normalizarTexto } from "./texto";
import type {
  AssertionEjercicio,
  ConteoAprendizaje,
  Ejercicio,
  Explicacion,
  IntentoEjercicio,
  ItemHistorial,
  Pregunta,
  ProgresoSondeo,
  SubtemaEstado,
} from "./tipos";

// Ruta absoluta: antes era "useLearn.db" relativo al directorio de trabajo, así que
// abrir el server desde otra carpeta creaba una base vacía y "desaparecían" las sesiones.
const RUTA_DB = process.env.USELEARN_DB ?? path.join(process.cwd(), "useLearn.db");

const db = new Database(RUTA_DB);

// WAL: lecturas y escrituras sin bloquearse entre sí.
// foreign_keys: SQLite las ignora por defecto y el esquema declara REFERENCES, así que
// hay que activarlas explícitamente para que se hagan cumplir.
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");

db.exec(`CREATE TABLE IF NOT EXISTS sesiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  texto_original TEXT NOT NULL,
  fase_actual TEXT NOT NULL DEFAULT 'sondeo',
  modelo TEXT,
  creada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS subtemas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sesion_id INTEGER NOT NULL REFERENCES sesiones(id),
  nombre TEXT NOT NULL,
  aciertos_seguidos INTEGER NOT NULL DEFAULT 0,
  cubierto INTEGER NOT NULL DEFAULT 0
)`);

db.exec(`CREATE TABLE IF NOT EXISTS preguntas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sesion_id INTEGER NOT NULL REFERENCES sesiones(id),
  subtema_id INTEGER NOT NULL REFERENCES subtemas(id),
  fase TEXT NOT NULL,
  contenido TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('multiple_choice', 'libre'))
)`);

db.exec(`CREATE TABLE IF NOT EXISTS respuestas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pregunta_id INTEGER NOT NULL REFERENCES preguntas(id),
  respuesta_usuario TEXT NOT NULL,
  correcta INTEGER NOT NULL,
  corregido_en TEXT
)`);

// Fase D — material de la fase Enseñar/Practicar. El patrón es el mismo que preguntas:
// columnas consultables + el contenido en JSON/TEXT, y todo se guarda por sub-tema.
db.exec(`CREATE TABLE IF NOT EXISTS explicaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sesion_id INTEGER NOT NULL REFERENCES sesiones(id),
  subtema_id INTEGER NOT NULL REFERENCES subtemas(id),
  orden INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  contenido TEXT NOT NULL,
  ejemplo TEXT,
  creada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS ejercicios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sesion_id INTEGER NOT NULL REFERENCES sesiones(id),
  subtema_id INTEGER NOT NULL REFERENCES subtemas(id),
  orden INTEGER NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL CHECK (tipo IN ('codigo', 'quiz')),
  lenguaje TEXT NOT NULL DEFAULT 'ninguno',
  variante TEXT,
  enunciado TEXT NOT NULL,
  plantilla TEXT,
  assertions TEXT,
  opciones TEXT,
  indice_correcta INTEGER,
  pista TEXT,
  solucion TEXT,
  dificultad TEXT NOT NULL DEFAULT 'media',
  creada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS intentos_ejercicio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ejercicio_id INTEGER NOT NULL REFERENCES ejercicios(id),
  codigo TEXT NOT NULL,
  aprobado INTEGER NOT NULL,
  salida TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

// --- Migraciones -------------------------------------------------------------
// Mismo patrón que ya usaba el proyecto: si la columna no existe, se agrega.
// Es idempotente, así que correrlo en cada arranque es seguro.

function columnasDe(tabla: string): string[] {
  return (db.prepare(`PRAGMA table_info(${tabla})`).all() as { name: string }[]).map((c) => c.name);
}

function asegurarColumna(tabla: string, columna: string, definicion: string): void {
  if (!columnasDe(tabla).includes(columna)) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  }
}

asegurarColumna("sesiones", "feedback_final", "TEXT");
asegurarColumna("preguntas", "respondida", "INTEGER NOT NULL DEFAULT 0");
asegurarColumna("subtemas", "total_incorrectas", "INTEGER NOT NULL DEFAULT 0");
// Contadores reales de desempeño: antes solo se guardaba "aciertos seguidos", que se
// resetea a 0 en cada error, así que no se podía saber cuántas veces acertó de verdad.
asegurarColumna("subtemas", "total_correctas", "INTEGER NOT NULL DEFAULT 0");
asegurarColumna("subtemas", "total_intentos", "INTEGER NOT NULL DEFAULT 0");
// Preguntas de un lote que quedaron sin usar porque el sub-tema ya se dominó: dejan de
// contar en el total del sondeo (antes inflaban para siempre el contador "x de y").
asegurarColumna("preguntas", "descartada", "INTEGER NOT NULL DEFAULT 0");
// Fase C1 — dos modalidades de entrada: notas pegadas vs. tema libre (donde el apunte
// lo genera el modelo y queda guardado como texto_original).
asegurarColumna("sesiones", "modo", "TEXT NOT NULL DEFAULT 'apunte'");
asegurarColumna("sesiones", "objetivo", "TEXT");
asegurarColumna("sesiones", "nivel", "TEXT");

// --- Feedback de calidad de preguntas (ítem 15) ------------------------------
// El usuario puede marcar "esta pregunta está mal". No es una funcionalidad de adorno: es la
// única fuente de etiquetado que tiene el proyecto, y de ella sale el set golden con el que se
// calibra el juez semántico (§10.5). Sin esto, el juez no se puede evaluar nunca.
//
// Se guarda la pregunta completa y el motivo, y NO se borra la fila: una pregunta reportada es
// justamente el dato más valioso que hay en la base. Lo que se marca es `descartada`, para que
// deje de servirse y de contar en el total del sondeo.
db.exec(`CREATE TABLE IF NOT EXISTS reportes_pregunta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sesion_id INTEGER NOT NULL REFERENCES sesiones(id),
  subtema_id INTEGER NOT NULL REFERENCES subtemas(id),
  pregunta_id INTEGER NOT NULL REFERENCES preguntas(id),
  motivo TEXT NOT NULL,
  contenido TEXT NOT NULL,
  creada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

// Saltar un sub-tema (ítem 15 bis). Antes "Saltar al siguiente" no dejaba rastro: el sub-tema
// quedaba pendiente en el sidebar para siempre, sin forma de volver a marcarlo ni de distinguir
// "no lo vi" de "lo vi y lo salteé". El dominio NO se toca: saltar no aprueba nada.
asegurarColumna("subtemas", "saltado", "INTEGER NOT NULL DEFAULT 0");
// Cobertura (Tanda 1): fragmento del material donde apareció cada sub-tema.
asegurarColumna("subtemas", "fragmento", "TEXT");

// --- Feedback de calidad de ejercicios (ítem 15, fase Enseñar) ---------------
// Misma idea que `reportes_pregunta` pero sobre la fase de práctica: el enunciado no dice qué
// hay que hacer, la solución no funciona, o el ejercicio repite uno de otro sub-tema.
//
// Se guardan aparte a propósito: el juez semántico de §14 evalúa preguntas del SONDEO, no
// ejercicios de código (que se verifican ejecutando). Meterlos en la misma tabla haría que la
// calibración del juez mezclara dos cosas que se miden distinto.
db.exec(`CREATE TABLE IF NOT EXISTS reportes_ejercicio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sesion_id INTEGER NOT NULL REFERENCES sesiones(id),
  subtema_id INTEGER NOT NULL REFERENCES subtemas(id),
  ejercicio_id INTEGER NOT NULL REFERENCES ejercicios(id),
  motivo TEXT NOT NULL,
  contenido TEXT NOT NULL,
  creada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

db.exec("CREATE INDEX IF NOT EXISTS idx_preguntas_subtema ON preguntas(subtema_id, respondida)");
db.exec("CREATE INDEX IF NOT EXISTS idx_preguntas_sesion ON preguntas(sesion_id, descartada)");
db.exec("CREATE INDEX IF NOT EXISTS idx_subtemas_sesion ON subtemas(sesion_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_respuestas_pregunta ON respuestas(pregunta_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_explicaciones_bloque ON explicaciones(sesion_id, subtema_id, orden)");
db.exec("CREATE INDEX IF NOT EXISTS idx_ejercicios_bloque ON ejercicios(sesion_id, subtema_id, orden)");
db.exec("CREATE INDEX IF NOT EXISTS idx_intentos_ejercicio ON intentos_ejercicio(ejercicio_id)");

// --- Tipos ------------------------------------------------------------------

export interface Sesion {
  id: number;
  topic: string;
  textoOriginal: string;
  faseActual: string;
  modelo: string | null;
  creadaEn: string;
  feedbackFinal: string | null;
  /** Modalidad de entrada (Fase C1): "apunte" | "tema_libre". */
  modo: string;
  objetivo: string | null;
  nivel: string | null;
}

export interface EstadoSondeo {
  sesion: Sesion | null;
  subtemas: SubtemaEstado[];
  progreso: ProgresoSondeo;
}

export interface ResultadoRespuesta {
  subtemaId: number;
  correcta: boolean;
  yaRespondida: boolean;
  /** La pregunta pertenecía a un lote abandonado: se guardó la respuesta pero no cuenta. */
  descartada?: boolean;
  /** El sub-tema quedó dominado (cubierto) con esta respuesta: su lote sobrante no sirve. */
  dominado?: boolean;
}

// --- Sesiones ---------------------------------------------------------------

/** Extras opcionales que viajan con la creación (Fase C1 — modalidades). */
interface NuevaSesion {
  modo?: string;
  objetivo?: string | null;
  nivel?: string | null;
}

function crearSesion(topic: string, textoOriginal: string, modelo: string | null = null, extras: NuevaSesion = {}): number {
  // El modelo se guarda: antes la columna existía pero quedaba siempre en NULL, así que
  // no había forma de saber con qué modelo se había generado una sesión.
  const result = db
    .prepare(
      "INSERT INTO sesiones (topic, texto_original, modelo, modo, objetivo, nivel) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      topic,
      textoOriginal,
      modelo,
      extras.modo ?? "apunte",
      extras.objetivo ?? null,
      extras.nivel ?? null
    );

  return Number(result.lastInsertRowid);
}

function obtenerSesion(sesionId: number): Sesion | null {
  const row = db
    .prepare(
      "SELECT id, topic, texto_original, fase_actual, modelo, creada_en, feedback_final, modo, objetivo, nivel FROM sesiones WHERE id = ?"
    )
    .get(sesionId) as
    | {
        id: number;
        topic: string;
        texto_original: string;
        fase_actual: string;
        modelo: string | null;
        creada_en: string;
        feedback_final: string | null;
        modo: string;
        objetivo: string | null;
        nivel: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    topic: row.topic,
    textoOriginal: row.texto_original,
    faseActual: row.fase_actual,
    modelo: row.modelo,
    creadaEn: row.creada_en,
    feedbackFinal: row.feedback_final,
    // Sesiones antiguas creadas antes de la migración quedan con 'apunte' (el DEFAULT).
    // Se devuelve el modo crudo: además de apunte/tema_libre existe "repaso" (memoria).
    modo: row.modo || "apunte",
    objetivo: row.objetivo,
    nivel: row.nivel,
  };
}

function listarSesionesConEstado(): {
  id: number;
  topic: string;
  creadoEn: string;
  completa: boolean;
  totalPreguntas: number;
  preguntasRespondidas: number;
}[] {
  const sesiones = db
    .prepare("SELECT id, topic, creada_en, feedback_final FROM sesiones ORDER BY creada_en DESC")
    .all() as { id: number; topic: string; creada_en: string; feedback_final: string | null }[];

  const conteos = db
    .prepare(
      `SELECT sesion_id, COUNT(*) AS total, COALESCE(SUM(respondida), 0) AS respondidas
       FROM preguntas WHERE descartada = 0 GROUP BY sesion_id`
    )
    .all() as { sesion_id: number; total: number; respondidas: number }[];

  const conteosPorSesion = new Map(conteos.map((conteo) => [conteo.sesion_id, conteo]));

  return sesiones.map((sesion) => {
    const conteo = conteosPorSesion.get(sesion.id);
    return {
      id: sesion.id,
      topic: sesion.topic,
      creadoEn: sesion.creada_en,
      completa: sesion.feedback_final !== null,
      totalPreguntas: conteo?.total ?? 0,
      preguntasRespondidas: conteo?.respondidas ?? 0,
    };
  });
}

// --- Reportes de ejercicios malos (fase Enseñar/Practicar) --------------------

/**
 * Motivos de un ejercicio malo. Son distintos de los de las preguntas del sondeo porque los
 * defectos son otros: acá no se "¿está bien la respuesta marcada?" sino "¿sé qué me piden hacer
 * y la solución anda?".
 */
export const MOTIVOS_EJERCICIO_MALA = [
  "no_se_entiende",
  "no_dice_que_hay_que_hacer",
  "la_solucion_no_funciona",
  "las_assertions_estan_mal",
  "repetido",
  "nada_que_ver_con_el_tema",
  "muy_dificil",
  "otra",
] as const;

export type MotivoEjercicioMalo = (typeof MOTIVOS_EJERCICIO_MALA)[number];

const ES_MOTIVO_EJERCICIO_VALIDO = new Set<string>(MOTIVOS_EJERCICIO_MALA);

export interface ResultadoReporteEjercicio {
  ok: boolean;
  yaReportado: boolean;
  subtemaId?: number;
  motivo?: string;
}

/**
 * Marca un ejercicio como malo y guarda el reporte.
 *
 * **No borra el ejercicio ni lo descarta del material.** A diferencia de la pregunta del sondeo
 * (que se descarta para que deje de servirse), acá el ejercicio ya se generó y está cacheado: si se
 * lo sacara, el usuario perdería la práctica de golpe a mitad de la sesión. Se marca el reporte y
 * el ejercicio queda visible, que además es lo que hace falta para poder reproducir el problema:
 * un ejercicio que "no funciona" solo sirve si se puede volver a abrir.
 *
 * Idempotente: reportar dos veces no duplica.
 */
const reportarEjercicioMalo = db.transaction(
  (ejercicioId: number, motivo: string): ResultadoReporteEjercicio => {
    const ejercicio = db
      .prepare("SELECT id, sesion_id, subtema_id FROM ejercicios WHERE id = ?")
      .get(ejercicioId) as
      | { id: number; sesion_id: number; subtema_id: number }
      | undefined;

    if (!ejercicio) throw new Error(`El ejercicio ${ejercicioId} no existe`);
    if (!ES_MOTIVO_EJERCICIO_VALIDO.has(motivo)) {
      throw new Error(
        `Motivo inválido: "${motivo}". Usar uno de: ${MOTIVOS_EJERCICIO_MALA.join(", ")}`
      );
    }

    const previa = db
      .prepare("SELECT id FROM reportes_ejercicio WHERE ejercicio_id = ?")
      .get(ejercicioId) as { id: number } | undefined;

    if (previa) {
      return { ok: true, yaReportado: true, subtemaId: ejercicio.subtema_id, motivo };
    }

    // Se guarda el JSON completo del ejercicio: sin el, el reporte no sirve para depurar,
    // porque el material se regenera y cambia entre corridas.
    const contenido = db
      .prepare("SELECT * FROM ejercicios WHERE id = ?")
      .get(ejercicioId) as Record<string, unknown>;
    for (const campo of ["assertions", "opciones"] as const) {
      const bruto = contenido[campo];
      if (typeof bruto === "string") {
        try {
          contenido[campo] = JSON.parse(bruto);
        } catch {
          contenido[campo] = bruto;
        }
      }
    }

    db.prepare(
      "INSERT INTO reportes_ejercicio (sesion_id, subtema_id, ejercicio_id, motivo, contenido) VALUES (?, ?, ?, ?, ?)"
    ).run(
      ejercicio.sesion_id,
      ejercicio.subtema_id,
      ejercicioId,
      motivo,
      JSON.stringify(contenido)
    );

    return { ok: true, yaReportado: false, subtemaId: ejercicio.subtema_id, motivo };
  }
);

/** Reportes de ejercicios de una sesión, para revisarlos y para alimentar el golden set. */
function obtenerReportesEjercicio(sesionId: number): {
  id: number;
  ejercicioId: number;
  subtemaId: number;
  motivo: string;
  contenido: string;
  creadaEn: string;
}[] {
  const filas = db
    .prepare(
      `SELECT id, ejercicio_id, subtema_id, motivo, contenido, creada_en
         FROM reportes_ejercicio WHERE sesion_id = ? ORDER BY id`
    )
    .all(sesionId) as {
    id: number;
    ejercicio_id: number;
    subtema_id: number;
    motivo: string;
    contenido: string;
    creada_en: string;
  }[];

  return filas.map((f) => ({
    id: f.id,
    ejercicioId: f.ejercicio_id,
    subtemaId: f.subtema_id,
    motivo: f.motivo,
    contenido: f.contenido,
    creadaEn: f.creada_en,
  }));
}

const eliminarSesion = db.transaction((sesionId: number): void => {
  // Orden por FKs: intentos → ejercicios → explicaciones → reportes → respuestas → preguntas →
  // subtemas → sesiones. Con foreign_keys = ON, borrar en otro orden tira un error.
  db.prepare(
    "DELETE FROM intentos_ejercicio WHERE ejercicio_id IN (SELECT id FROM ejercicios WHERE sesion_id = ?)"
  ).run(sesionId);
  db.prepare("DELETE FROM reportes_ejercicio WHERE sesion_id = ?").run(sesionId);
  db.prepare("DELETE FROM ejercicios WHERE sesion_id = ?").run(sesionId);
  db.prepare("DELETE FROM explicaciones WHERE sesion_id = ?").run(sesionId);
  db.prepare("DELETE FROM reportes_pregunta WHERE sesion_id = ?").run(sesionId);
  db.prepare("DELETE FROM respuestas WHERE pregunta_id IN (SELECT id FROM preguntas WHERE sesion_id = ?)").run(sesionId);
  db.prepare("DELETE FROM preguntas WHERE sesion_id = ?").run(sesionId);
  db.prepare("DELETE FROM subtemas WHERE sesion_id = ?").run(sesionId);
  db.prepare("DELETE FROM sesiones WHERE id = ?").run(sesionId);
});

function actualizarFaseSesion(sesionId: number, fase: string): void {
  db.prepare("UPDATE sesiones SET fase_actual = ? WHERE id = ?").run(fase, sesionId);
}

/**
 * Cierra el sondeo: guarda el feedback y avanza la fase a "plan" en la misma escritura.
 * Antes la fase vivía solo en el useState del cliente, así que recargar la página
 * devolvía al sondeo y el plan se perdía.
 */
function finalizarSondeo(sesionId: number, feedback: string): void {
  db.prepare("UPDATE sesiones SET feedback_final = ?, fase_actual = 'plan' WHERE id = ?").run(feedback, sesionId);
}

// --- Reportes de preguntas malas (ítem 15) ------------------------------------

/** Motivos que el botón ofrece. Texto corto y cerrado: el set golden necesita categorías limpias. */
export const MOTIVOS_PREGUNTA_MALA = [
  "respuesta_mal_marcada",
  "explicacion_contradicoria",
  "enunciado_ambiguo",
  "no_respondible_con_el_texto",
  "repetida",
  "otra",
] as const;

export type MotivoPreguntaMala = (typeof MOTIVOS_PREGUNTA_MALA)[number];

/** Resultado de reportar una pregunta: qué pasó y qué tiene que hacer el cliente. */
export interface ResultadoReporte {
  ok: boolean;
  yaReportada: boolean;
  subtemaId?: number;
  motivo?: string;
}

const ES_MOTIVO_VALIDO = new Set<string>(MOTIVOS_PREGUNTA_MALA);

/**
 * Marca una pregunta como mala: la descarta del sondeo y guarda el reporte.
 *
 * Dos decisiones que conviene no revertir:
 * - **No borra nada.** La fila de `preguntas` sigue ahí y el reporte guarda una copia del
 *   contenido. Una pregunta que un usuario descartó es exactamente el ejemplo que necesita el
 *   set golden del juez; borrarla sería tirar el dato.
 * - **No cuenta como respuesta ni toca el desempeño del sub-tema.** Una pregunta mala no es un
 *   error del usuario: si contara para `aciertos_seguidos` o sumara un intento, marcar una
 *   pregunta podría "des-dominar" el sub-tema.
 *
 * Es idempotente: reportar dos veces la misma pregunta no duplica el reporte.
 */
const reportarPreguntaMala = db.transaction(
  (preguntaId: number, motivo: string): ResultadoReporte => {
    const pregunta = db
      .prepare("SELECT id, sesion_id, subtema_id, contenido FROM preguntas WHERE id = ?")
      .get(preguntaId) as
      | { id: number; sesion_id: number; subtema_id: number; contenido: string }
      | undefined;

    if (!pregunta) throw new Error(`La pregunta ${preguntaId} no existe`);
    if (!ES_MOTIVO_VALIDO.has(motivo)) {
      throw new Error(`Motivo inválido: "${motivo}". Usar uno de: ${MOTIVOS_PREGUNTA_MALA.join(", ")}`);
    }

    const previa = db
      .prepare("SELECT id FROM reportes_pregunta WHERE pregunta_id = ?")
      .get(preguntaId) as { id: number } | undefined;

    if (previa) {
      // Ya estaba reportada: se asegura el descarte (por si se recargó la página) y no se duplica.
      db.prepare("UPDATE preguntas SET descartada = 1 WHERE id = ?").run(preguntaId);
      return { ok: true, yaReportada: true, subtemaId: pregunta.subtema_id, motivo };
    }

    db.prepare(
      "INSERT INTO reportes_pregunta (sesion_id, subtema_id, pregunta_id, motivo, contenido) VALUES (?, ?, ?, ?, ?)"
    ).run(pregunta.sesion_id, pregunta.subtema_id, preguntaId, motivo, pregunta.contenido);

    // `descartada` la saca del total servible del sondeo y de `obtenerPreguntasSinResponder`,
    // así que el cliente recibe la siguiente sin que haga falta un caso especial para esto.
    db.prepare("UPDATE preguntas SET descartada = 1 WHERE id = ?").run(preguntaId);

    return { ok: true, yaReportada: false, subtemaId: pregunta.subtema_id, motivo };
  }
);

/** Reportes de una sesión, para el set golden del juez y para revisarlos a mano. */
function obtenerReportes(sesionId: number): {
  id: number;
  preguntaId: number;
  subtemaId: number;
  motivo: string;
  contenido: string;
  creadaEn: string;
}[] {
  const filas = db
    .prepare(
      `SELECT id, pregunta_id, subtema_id, motivo, contenido, creada_en
         FROM reportes_pregunta WHERE sesion_id = ? ORDER BY id`
    )
    .all(sesionId) as {
    id: number;
    pregunta_id: number;
    subtema_id: number;
    motivo: string;
    contenido: string;
    creada_en: string;
  }[];

  return filas.map((f) => ({
    id: f.id,
    preguntaId: f.pregunta_id,
    subtemaId: f.subtema_id,
    motivo: f.motivo,
    contenido: f.contenido,
    creadaEn: f.creada_en,
  }));
}

// --- Sub-temas --------------------------------------------------------------

function agregarSubtema(sesionId: number, nombre: string, fragmento: string | null = null): number {
  const result = db
    .prepare("INSERT INTO subtemas (sesion_id, nombre, fragmento) VALUES (?, ?, ?)")
    .run(sesionId, nombre, fragmento);
  return Number(result.lastInsertRowid);
}

/** Resultado del descarte de sub-temas (Fase C1). `motivo` explica por qué no se pudo. */
interface ResultadoDescarte {
  ok: boolean;
  restantes: number;
  motivo?: string;
}

/**
 * Fase C1 — quita sub-temas antes de que empiece el sondeo (ingesta explícita): la
 * pantalla de confirmación de la landing permite desmarcar sub-temas detectados.
 * Guardas: solo mientras la sesión sigue en "sondeo" y sin respuestas (borrar sub-temas
 * con respuestas rompería la FK respuestas → preguntas y contaría mal el progreso).
 */
function descartarSubtemas(sesionId: number, mantenerIds: number[]): ResultadoDescarte {
  const ids = Array.from(
    new Set(mantenerIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))
  );

  const sesion = db.prepare("SELECT fase_actual FROM sesiones WHERE id = ?").get(sesionId) as
    | { fase_actual: string }
    | undefined;

  if (!sesion) return { ok: false, restantes: 0, motivo: "Sesión no encontrada." };
  if (ids.length === 0) return { ok: false, restantes: 0, motivo: "Hay que mantener al menos un sub-tema." };
  if (sesion.fase_actual !== "sondeo") {
    return { ok: false, restantes: 0, motivo: "La sesión ya avanzó de fase: no se pueden quitar sub-temas." };
  }

  const respondidas = db
    .prepare(
      `SELECT COUNT(*) AS n FROM respuestas r JOIN preguntas p ON p.id = r.pregunta_id WHERE p.sesion_id = ?`
    )
    .get(sesionId) as { n: number };

  if (respondidas.n > 0) {
    return { ok: false, restantes: 0, motivo: "Ya hay respuestas en esta sesión: no se pueden quitar sub-temas." };
  }

  const placeholders = ids.map(() => "?").join(",");

  const restantes = db.transaction(() => {
    // Las preguntas de los sub-temas descartados se borran primero: no hay respuestas
    // (revisado arriba), así que la FK no se rompe.
    db.prepare(`DELETE FROM preguntas WHERE sesion_id = ? AND subtema_id NOT IN (${placeholders})`).run(
      sesionId,
      ...ids
    );
    db.prepare(`DELETE FROM subtemas WHERE sesion_id = ? AND id NOT IN (${placeholders})`).run(sesionId, ...ids);
    const fila = db.prepare("SELECT COUNT(*) AS n FROM subtemas WHERE sesion_id = ?").get(sesionId) as {
      n: number;
    };
    return fila.n;
  })();

  return { ok: true, restantes };
}

function obtenerSubtemas(sesionId: number): SubtemaEstado[] {
  const filas = db
    .prepare(
      `SELECT id, nombre, aciertos_seguidos, cubierto, total_correctas, total_intentos,
              total_incorrectas, saltado, fragmento
         FROM subtemas WHERE sesion_id = ? ORDER BY id`
    )
    .all(sesionId) as {
      id: number;
      nombre: string;
      aciertos_seguidos: number;
      cubierto: number;
      total_correctas: number;
      total_intentos: number;
      total_incorrectas: number;
      saltado: number;
      fragmento: string | null;
    }[];

  return filas.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    fragmento: fila.fragmento ?? null,
    aciertosSeguidos: fila.aciertos_seguidos,
    intentos: fila.total_intentos,
    correctas: fila.total_correctas,
    incorrectas: fila.total_incorrectas,
    cubierto: fila.cubierto === 1,
    saltado: fila.saltado === 1,
  }));
}

/**
 * Marca (o desmarca) un sub-tema como saltado.
 *
 * No toca `aciertos_seguidos` ni `cubierto` a propósito: saltar no es aprobar ni reprobar, es
 * "lo vi y sigo". El flag existe para que la UI distinga "pendiente" de "saltado" en vez de dejar
 * un contador que nunca baja y hace sentir que la sesión quedó a medias.
 */
const marcarSubtemaSaltado = db.transaction(
  (subtemaId: number, saltado: boolean): { ok: boolean; saltado: boolean } => {
    const existe = db.prepare("SELECT id FROM subtemas WHERE id = ?").get(subtemaId);
    if (!existe) throw new Error(`El sub-tema ${subtemaId} no existe`);
    db.prepare("UPDATE subtemas SET saltado = ? WHERE id = ?").run(saltado ? 1 : 0, subtemaId);
    return { ok: true, saltado };
  }
);

/**
 * Criterio único de "sub-tema débil": falló al menos una vez.
 * Antes se derivaba de `cubierto = 0`, así que un sub-tema con un error que después se
 * dominó (2 aciertos seguidos) quedaba como "dominado" y el feedback no lo mencionaba
 * como área a reforzar, aunque el usuario sí hubiera fallado. `cubierto` dice dónde está
 * parado hoy el sub-tema; `débil` dice si hubo error en el camino.
 */
function esSubtemaDebil(totalIncorrectas: number): boolean {
  return totalIncorrectas > 0;
}

/**
 * Sub-temas que falló al menos una vez (mismo criterio que esSubtemaDebil). Se calcula en
 * el servidor porque antes se derivaba del historial del cliente, que arranca vacío al
 * recargar: reabrir una sesión pasada mostraba siempre "no fallaste ningún subtema".
 */
function obtenerSubtemasDebiles(sesionId: number): string[] {
  const filas = db
    .prepare(
      `SELECT nombre FROM subtemas
       WHERE sesion_id = ? AND total_incorrectas > 0
       ORDER BY total_incorrectas DESC, total_intentos ASC, id ASC`
    )
    .all(sesionId) as { nombre: string }[];

  return filas.map((fila) => fila.nombre);
}

/**
 * Sub-temas que no llegaron a dominarse (`cubierto = 0`). Incluye los que el sondeo nunca
 * preguntó (se cerró por el tope de seguridad) y los que quedaron a medias. Antes no se
 * mostraban en ningún lado, así que el plan podía decir "dominaste todos los sub-temas"
 * aunque hubiera sub-temas sin evaluar.
 */
function obtenerSubtemasSinDominar(sesionId: number): string[] {
  const filas = db
    .prepare(
      `SELECT nombre FROM subtemas
       WHERE sesion_id = ? AND cubierto = 0
       ORDER BY total_intentos ASC, id ASC`
    )
    .all(sesionId) as { nombre: string }[];

  return filas.map((fila) => fila.nombre);
}

function sondeoCompleto(subtemas: SubtemaEstado[]): boolean {
  return subtemas.length > 0 && subtemas.every((subtema) => subtema.cubierto);
}

/** Elige el sub-tema menos dominado que siga sin cubrirse (función pura, sin queries). */
function elegirSiguienteSubtema(subtemas: SubtemaEstado[]): SubtemaEstado | null {
  const disponibles = subtemas.filter((subtema) => !subtema.cubierto);
  if (disponibles.length === 0) return null;

  const minAciertos = Math.min(...disponibles.map((subtema) => subtema.aciertosSeguidos));
  return disponibles.find((subtema) => subtema.aciertosSeguidos === minAciertos) ?? null;
}

// --- Preguntas --------------------------------------------------------------

/**
 * Fase B.10 — guarda el lote completo en UNA transacción. Antes era un INSERT por
 * pregunta (N roundtrips a SQLite por lote).
 */
const guardarLote = db.transaction(
  (sesionId: number, subtemaId: number, fase: string, lote: string[]): number[] => {
    const stmt = db.prepare(
      "INSERT INTO preguntas (sesion_id, subtema_id, fase, contenido, tipo) VALUES (?, ?, ?, ?, 'multiple_choice')"
    );
    return lote.map((contenido) => Number(stmt.run(sesionId, subtemaId, fase, contenido).lastInsertRowid));
  }
);

function guardarPregunta(sesionId: number, subtemaId: number, fase: string, contenido: string, tipo: string): number {
  const resultado = db
    .prepare("INSERT INTO preguntas (sesion_id, subtema_id, fase, contenido, tipo) VALUES (?, ?, ?, ?, ?)")
    .run(sesionId, subtemaId, fase, contenido, tipo);

  return Number(resultado.lastInsertRowid);
}

/** Guarda el lote de una vez (una transacción): devuelve los ids en orden. */
function guardarLotePreguntas(sesionId: number, subtemaId: number, fase: string, contenidos: string[]): number[] {
  return guardarLote(sesionId, subtemaId, fase, contenidos);
}

function obtenerPreguntasSinResponder(subtemaId: number): { id: number; contenido: string }[] {
  return db
    .prepare(
      "SELECT id, contenido FROM preguntas WHERE subtema_id = ? AND respondida = 0 AND descartada = 0 ORDER BY id"
    )
    .all(subtemaId) as { id: number; contenido: string }[];
}

/** Enunciados ya generados para un sub-tema: se le pasan al modelo para que no los repita. */
function obtenerPreguntasDelSubtema(subtemaId: number): string[] {
  return enunciadosDe(
    "SELECT contenido FROM preguntas WHERE subtema_id = ? AND descartada = 0 ORDER BY id",
    subtemaId
  );
}

/**
 * Enunciados de TODA la sesión (incluye descartadas: también cuentan como vistas).
 * La anti-repetición era solo por sub-tema, así que al cambiar de sub-tema el modelo
 * repetía preguntas ya vistas sin que nadie se lo impidiera.
 */
function obtenerEnunciadosSesion(sesionId: number): string[] {
  return enunciadosDe(
    "SELECT contenido FROM preguntas WHERE sesion_id = ? ORDER BY id",
    sesionId
  );
}

/** Extrae el campo `pregunta` del JSON guardado (tolera contenido ilegible). */
function enunciadosDe(query: string, arg: number): string[] {
  const filas = db.prepare(query).all(arg) as { contenido: string }[];

  return filas
    .map((fila) => {
      try {
        const parsed = JSON.parse(fila.contenido);
        return typeof parsed?.pregunta === "string" ? parsed.pregunta : "";
      } catch {
        return "";
      }
    })
    .filter((texto) => texto.length > 0);
}

/**
 * Registra la respuesta del usuario y actualiza el estado del sub-tema en una sola
 * transacción. Es el único punto donde se escribe `respuestas`: antes la tabla existía
 * pero nunca se llenaba, así que la app descartaba qué opción había elegido el usuario.
 * La correcta se recalcula en el servidor a partir del texto elegido, en vez de confiar
 * en el booleano que mandaba el cliente.
 */
const registrarRespuesta = db.transaction(
  (preguntaId: number, opcionElegida: string): ResultadoRespuesta => {
    const pregunta = db
      .prepare("SELECT id, subtema_id, contenido, respondida, descartada FROM preguntas WHERE id = ?")
      .get(preguntaId) as
      | {
          id: number;
          subtema_id: number;
          contenido: string;
          respondida: number;
          descartada: number;
        }
      | undefined;

    if (!pregunta) {
      throw new Error(`La pregunta ${preguntaId} no existe`);
    }

    // Idempotente: doble click, reintento de red o recarga no duplican la respuesta ni
    // vuelven a contar el intento.
    if (pregunta.respondida === 1) {
      const previa = db
        .prepare("SELECT correcta FROM respuestas WHERE pregunta_id = ? ORDER BY id DESC LIMIT 1")
        .get(preguntaId) as { correcta: number } | undefined;

      return { subtemaId: pregunta.subtema_id, correcta: previa?.correcta === 1, yaRespondida: true };
    }

    const datos = JSON.parse(pregunta.contenido) as Pregunta;
    const esperada = datos.opciones[datos.indiceCorrecta] ?? "";
    const correcta = normalizarTexto(opcionElegida) === normalizarTexto(esperada);
    // Pregunta de un lote abandonado (el sub-tema ya se había dominado y el servidor
    // descartó las que sobraban). El cliente puede seguir mostrándola desde su caché en
    // memoria hasta que sabe que el sub-tema se cubrió.
    const abandonada = pregunta.descartada === 1;

    db.prepare("INSERT INTO respuestas (pregunta_id, respuesta_usuario, correcta, corregido_en) VALUES (?, ?, ?, CURRENT_TIMESTAMP)").run(preguntaId, opcionElegida, correcta ? 1 : 0);

    // Se marca como respondida ANTES de actualizar el sub-tema: el descarte de preguntas
    // sin usar de abajo filtra por respondida = 0, y si no la recién respondida quedaría
    // marcada como descartada por error.
    db.prepare("UPDATE preguntas SET respondida = 1 WHERE id = ?").run(preguntaId);

    // Respuesta a una pregunta que el sondeo ya había abandonado: se guarda el texto (el
    // usuario la respondió) pero NO se toca el desempeño del sub-tema. Antes una pregunta
    // descartada podía bajar `aciertos_seguidos` a 0 y "des-dominar" un sub-tema ya
    // cubierto, además de inflar los contadores con intentos que no contaban.
    if (abandonada) {
      return { subtemaId: pregunta.subtema_id, correcta, yaRespondida: false, descartada: true };
    }

    let dominado = false;
    const subtema = db
      .prepare("SELECT aciertos_seguidos FROM subtemas WHERE id = ?")
      .get(pregunta.subtema_id) as { aciertos_seguidos: number } | undefined;

    if (subtema) {
      // Al fallar, los aciertos seguidos vuelven a 0 y el sub-tema deja de estar dominado.
      const aciertos = correcta ? subtema.aciertos_seguidos + 1 : 0;
      dominado = aciertos >= ACIERTOS_SEGUIDOS_PARA_DOMINAR;

      db.prepare(
        `UPDATE subtemas SET
           aciertos_seguidos = ?,
           cubierto = ?,
           total_correctas = total_correctas + ?,
           total_intentos = total_intentos + 1,
           total_incorrectas = total_incorrectas + ?
         WHERE id = ?`
      ).run(aciertos, dominado ? 1 : 0, correcta ? 1 : 0, correcta ? 0 : 1, pregunta.subtema_id);

      // Las preguntas que ya no se van a usar dejan de contar en el progreso del sondeo.
      if (dominado) {
        db.prepare("UPDATE preguntas SET descartada = 1 WHERE subtema_id = ? AND respondida = 0").run(
          pregunta.subtema_id
        );
      }
    }

    return { subtemaId: pregunta.subtema_id, correcta, yaRespondida: false, dominado };
  }
);

/** Errores concretos del sondeo: qué eligió el usuario y cuál era la correcta. */
function obtenerErroresSesion(sesionId: number): {
  subtema: string;
  pregunta: string;
  elegida: string;
  correcta: string;
}[] {
  const filas = db
    .prepare(
      `SELECT s.nombre AS subtema, p.contenido AS contenido, r.respuesta_usuario AS elegida
       FROM respuestas r
         JOIN preguntas p ON p.id = r.pregunta_id
         JOIN subtemas s ON s.id = p.subtema_id
       WHERE p.sesion_id = ? AND r.correcta = 0
       ORDER BY r.id`
    )
    .all(sesionId) as { subtema: string; contenido: string; elegida: string }[];

  return filas.map((fila) => {
    let pregunta = "";
    let correcta = "";
    try {
      const datos = JSON.parse(fila.contenido) as Pregunta;
      pregunta = datos.pregunta ?? "";
      correcta = datos.opciones[datos.indiceCorrecta] ?? "";
    } catch {
      // Contenido ilegible: se conserva el error aunque no se pueda mostrar el detalle.
    }
    return { subtema: fila.subtema, pregunta, elegida: fila.elegida, correcta };
  });
}

/**
 * Preguntas ya respondidas, en el orden real en que se respondieron. Permite reanudar un
 * sondeo a medias: antes recargar la página borraba el historial visual y el usuario veía
 * "Pregunta 12" sin ninguna pregunta previa en pantalla.
 */
function obtenerHistorialSesion(sesionId: number): ItemHistorial[] {
  const filas = db
    .prepare(
      `SELECT p.id AS preguntaId, p.subtema_id AS subtemaId, s.nombre AS subtemaNombre,
              p.contenido AS contenido, r.respuesta_usuario AS opcionElegida, r.correcta AS correcta
       FROM respuestas r
         JOIN preguntas p ON p.id = r.pregunta_id
         JOIN subtemas s ON s.id = p.subtema_id
       WHERE p.sesion_id = ?
       ORDER BY r.id`
    )
    .all(sesionId) as {
      preguntaId: number;
      subtemaId: number;
      subtemaNombre: string;
      contenido: string;
      opcionElegida: string;
      correcta: number;
    }[];

  const historial: ItemHistorial[] = [];
  for (const fila of filas) {
    try {
      historial.push({
        preguntaId: fila.preguntaId,
        subtemaId: fila.subtemaId,
        subtemaNombre: fila.subtemaNombre,
        pregunta: JSON.parse(fila.contenido) as Pregunta,
        opcionElegida: fila.opcionElegida,
        correcta: fila.correcta === 1,
      });
    } catch {
      // Pregunta ilegible: se saltea en lugar de romper la reanudación.
    }
  }

  return historial;
}

// --- Material de aprendizaje (Fase D) ----------------------------------------

/** Explicación lista para insertar (el llamador ya validó contenido y orden). */
interface NuevaExplicacion {
  subtemaId: number;
  orden: number;
  tipo: string;
  titulo: string;
  contenido: string;
  ejemplo?: string | null;
}

/** Ejercicio listo para insertar; los campos JSON se serializan acá (un solo lugar). */
interface NuevoEjercicio {
  subtemaId: number;
  orden?: number;
  tipo: "codigo" | "quiz";
  lenguaje?: string;
  variante?: string | null;
  enunciado: string;
  plantilla?: string | null;
  assertions?: AssertionEjercicio[];
  opciones?: string[] | null;
  indiceCorrecta?: number | null;
  pista?: string | null;
  solucion?: string | null;
  dificultad?: string;
}

/** Parseo tolerante: una columna JSON ilegible no debería tumbar la fase entera. */
function parsearJson<T>(texto: string | null, respaldo: T): T {
  if (!texto) return respaldo;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return respaldo;
  }
}

/** Guarda las explicaciones de un sub-tema en una sola transacción (patrón del lote). */
const guardarExplicaciones = db.transaction((sesionId: number, items: NuevaExplicacion[]): number[] => {
  const stmt = db.prepare(
    "INSERT INTO explicaciones (sesion_id, subtema_id, orden, tipo, titulo, contenido, ejemplo) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  return items.map((item) =>
    Number(
      stmt.run(
        sesionId,
        item.subtemaId,
        item.orden,
        item.tipo,
        item.titulo,
        item.contenido,
        item.ejemplo ?? null
      ).lastInsertRowid
    )
  );
});

/** Guarda los ejercicios de un sub-tema en una sola transacción. */
const guardarEjercicios = db.transaction((sesionId: number, items: NuevoEjercicio[]): number[] => {
  const stmt = db.prepare(
    `INSERT INTO ejercicios
       (sesion_id, subtema_id, orden, tipo, lenguaje, variante, enunciado, plantilla,
        assertions, opciones, indice_correcta, pista, solucion, dificultad)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  return items.map((item, indice) =>
    Number(
      stmt.run(
        sesionId,
        item.subtemaId,
        item.orden ?? indice,
        item.tipo,
        item.lenguaje ?? "ninguno",
        item.variante ?? null,
        item.enunciado,
        item.plantilla ?? null,
        item.assertions && item.assertions.length > 0 ? JSON.stringify(item.assertions) : null,
        item.opciones && item.opciones.length > 0 ? JSON.stringify(item.opciones) : null,
        item.indiceCorrecta ?? null,
        item.pista ?? null,
        item.solucion ?? null,
        item.dificultad ?? "media"
      ).lastInsertRowid
    )
  );
});

function obtenerExplicaciones(sesionId: number, subtemaId: number): Explicacion[] {
  const filas = db
    .prepare(
      `SELECT id, subtema_id, orden, tipo, titulo, contenido, ejemplo
       FROM explicaciones WHERE sesion_id = ? AND subtema_id = ? ORDER BY orden, id`
    )
    .all(sesionId, subtemaId) as {
    id: number;
    subtema_id: number;
    orden: number;
    tipo: string;
    titulo: string;
    contenido: string;
    ejemplo: string | null;
  }[];

  return filas.map((fila) => ({
    id: fila.id,
    subtemaId: fila.subtema_id,
    orden: fila.orden,
    tipo: fila.tipo,
    titulo: fila.titulo,
    contenido: fila.contenido,
    ejemplo: fila.ejemplo,
  }));
}

/** Fila cruda de `ejercicios`, compartida por los dos lectores de abajo. */
interface FilaEjercicio {
  id: number;
  sesion_id?: number;
  subtema_id: number;
  orden: number;
  tipo: string;
  lenguaje: string;
  variante: string | null;
  enunciado: string;
  plantilla: string | null;
  assertions: string | null;
  opciones: string | null;
  indice_correcta: number | null;
  pista: string | null;
  solucion: string | null;
  dificultad: string;
}

function filaAEjercicio(fila: FilaEjercicio): Ejercicio {
  return {
    id: fila.id,
    subtemaId: fila.subtema_id,
    orden: fila.orden,
    tipo: fila.tipo === "quiz" ? ("quiz" as const) : ("codigo" as const),
    lenguaje: fila.lenguaje,
    variante: fila.variante,
    enunciado: fila.enunciado,
    plantilla: fila.plantilla,
    assertions: parsearJson<AssertionEjercicio[]>(fila.assertions, []),
    opciones: parsearJson<string[] | null>(fila.opciones, null),
    indiceCorrecta: fila.indice_correcta,
    pista: fila.pista,
    solucion: fila.solucion,
    dificultad: fila.dificultad,
  };
}

function obtenerEjercicios(sesionId: number, subtemaId: number): Ejercicio[] {
  const filas = db
    .prepare(
      `SELECT id, subtema_id, orden, tipo, lenguaje, variante, enunciado, plantilla,
              assertions, opciones, indice_correcta, pista, solucion, dificultad
       FROM ejercicios WHERE sesion_id = ? AND subtema_id = ? ORDER BY orden, id`
    )
    .all(sesionId, subtemaId) as FilaEjercicio[];

  return filas.map(filaAEjercicio);
}

/**
 * Enunciados de TODOS los ejercicios de la sesión, opcionalmente excluyendo un sub-tema.
 *
 * Es la entrada que anti-repetición necesita: el modelo no puede evitar repetir algo que no le
 * mostraste. Antes se pasaba `[]` siempre (ver el route de `/api/aprender/bloque`), y por eso dos
 * sesiones sobre el mismo tema generaron el mismo ejercicio — medido: "Crea una función llamada
 * `configurarUsuario`..." con similitud 0.50 entre las sesiones 58 y 63.
 *
 * Se excluye el sub-tema propio porque sus variantes `js` y `jsx` comparten el enunciado a
 * propósito: si entraran en la lista, el parser se comería la segunda variante del par.
 */
function obtenerEnunciadosEjercicios(sesionId: number, exceptoSubtemaId?: number): string[] {
  const filas = db
    .prepare(
      `SELECT e.enunciado FROM ejercicios e
        WHERE e.sesion_id = ? AND (? IS NULL OR e.subtema_id <> ?)
        ORDER BY e.id`
    )
    .all(sesionId, exceptoSubtemaId ?? null, exceptoSubtemaId ?? null) as { enunciado: string }[];
  return filas.map((f) => f.enunciado);
}

/** Un ejercicio por id (el endpoint de intentos lo usa para corregir quiz en el server). */
function obtenerEjercicioPorId(ejercicioId: number): (Ejercicio & { sesionId: number }) | null {
  const fila = db
    .prepare(
      `SELECT id, sesion_id, subtema_id, orden, tipo, lenguaje, variante, enunciado, plantilla,
              assertions, opciones, indice_correcta, pista, solucion, dificultad
       FROM ejercicios WHERE id = ?`
    )
    .get(ejercicioId) as FilaEjercicio | undefined;

  if (!fila) return null;
  return { ...filaAEjercicio(fila), sesionId: fila.sesion_id ?? 0 };
}

/** Registra un intento (aprobado por el runner del sandbox o por el quiz). */
const registrarIntentoEjercicio = db.transaction(
  (ejercicioId: number, codigo: string, aprobado: boolean, salida: string | null): number => {
    const result = db
      .prepare(
        "INSERT INTO intentos_ejercicio (ejercicio_id, codigo, aprobado, salida) VALUES (?, ?, ?, ?)"
      )
      .run(ejercicioId, codigo, aprobado ? 1 : 0, salida);
    return Number(result.lastInsertRowid);
  }
);

function obtenerIntentosEjercicio(ejercicioId: number): IntentoEjercicio[] {
  const filas = db
    .prepare(
      `SELECT id, ejercicio_id, codigo, aprobado, salida, creado_en
       FROM intentos_ejercicio WHERE ejercicio_id = ? ORDER BY id`
    )
    .all(ejercicioId) as {
    id: number;
    ejercicio_id: number;
    codigo: string;
    aprobado: number;
    salida: string | null;
    creado_en: string;
  }[];

  return filas.map((fila) => ({
    id: fila.id,
    ejercicioId: fila.ejercicio_id,
    codigo: fila.codigo,
    aprobado: fila.aprobado === 1,
    salida: fila.salida,
    creadoEn: fila.creado_en,
  }));
}

/**
 * Conteos por sub-tema en UNA consulta: son lo que el sidebar de práctica muestra como
 * "3/3 explicaciones · 1/2 ejercicios" sin traer el material completo de toda la sesión.
 */
function contarAprendizaje(sesionId: number): ConteoAprendizaje[] {
  const filas = db
    .prepare(
      `SELECT s.id AS subtemaId,
              (SELECT COUNT(*) FROM explicaciones x WHERE x.subtema_id = s.id) AS explicaciones,
              (SELECT COUNT(*) FROM ejercicios e WHERE e.subtema_id = s.id) AS ejercicios,
              (SELECT COUNT(*) FROM ejercicios e2
                 WHERE e2.subtema_id = s.id
                   AND EXISTS (SELECT 1 FROM intentos_ejercicio i
                               WHERE i.ejercicio_id = e2.id AND i.aprobado = 1)) AS ejerciciosAprobados
       FROM subtemas s WHERE s.sesion_id = ? ORDER BY s.id`
    )
    .all(sesionId) as {
    subtemaId: number;
    explicaciones: number;
    ejercicios: number;
    ejerciciosAprobados: number;
  }[];

  return filas.map((fila) => ({
    subtemaId: fila.subtemaId,
    explicaciones: fila.explicaciones,
    ejercicios: fila.ejercicios,
    ejerciciosAprobados: fila.ejerciciosAprobados,
  }));
}

// --- Progreso ---------------------------------------------------------------

function contarProgresoSesion(sesionId: number, subtemas?: SubtemaEstado[]): ProgresoSondeo {
  const fila = db
    .prepare(
      `SELECT COUNT(*) AS totalServibles, COALESCE(SUM(respondida), 0) AS respondidas
       FROM preguntas WHERE sesion_id = ? AND descartada = 0`
    )
    .get(sesionId) as { totalServibles: number; respondidas: number };

  const lista = subtemas ?? obtenerSubtemas(sesionId);

  return {
    respondidas: fila.respondidas,
    totalServibles: fila.totalServibles,
    subtemasTotal: lista.length,
    subtemasCubiertos: lista.filter((subtema) => subtema.cubierto).length,
  };
}

/** Estado completo del sondeo en 3 consultas, en vez de releer los sub-temas en cada helper. */
function obtenerEstadoSondeo(sesionId: number): EstadoSondeo {
  const sesion = obtenerSesion(sesionId);
  if (!sesion) {
    return {
      sesion: null,
      subtemas: [],
      progreso: { respondidas: 0, totalServibles: 0, subtemasTotal: 0, subtemasCubiertos: 0 },
    };
  }

  const subtemas = obtenerSubtemas(sesionId);

  return { sesion, subtemas, progreso: contarProgresoSesion(sesionId, subtemas) };
}

export default db;
export {
  crearSesion,
  agregarSubtema,
  descartarSubtemas,
  obtenerSubtemas,
  /** Saltar/des-saltar un sub-tema sin tocar el dominio. */
  marcarSubtemaSaltado,
  guardarExplicaciones,
  guardarEjercicios,
  obtenerExplicaciones,
  obtenerEjercicios,
  obtenerEjercicioPorId,
  /** Anti-repetición de ejercicios: enunciados de la sesión salvo los del sub-tema dado. */
  obtenerEnunciadosEjercicios,
  registrarIntentoEjercicio,
  obtenerIntentosEjercicio,
  contarAprendizaje,
  obtenerSesion,
  elegirSiguienteSubtema,
  sondeoCompleto,
  guardarPregunta,
  guardarLotePreguntas,
  obtenerPreguntasSinResponder,
  obtenerPreguntasDelSubtema,
  obtenerEnunciadosSesion,
  registrarRespuesta,
  reportarPreguntaMala,
  obtenerReportes,
  reportarEjercicioMalo,
  obtenerReportesEjercicio,
  obtenerErroresSesion,
  obtenerHistorialSesion,
  contarProgresoSesion,
  obtenerEstadoSondeo,
  esSubtemaDebil,
  obtenerSubtemasDebiles,
  obtenerSubtemasSinDominar,
  actualizarFaseSesion,
  finalizarSondeo,
  listarSesionesConEstado,
  eliminarSesion,
};
