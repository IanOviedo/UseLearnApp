import path from "node:path";
import Database from "better-sqlite3";
import { ACIERTOS_SEGUIDOS_PARA_DOMINAR } from "./config";
import { normalizarTexto } from "./texto";
import type { ItemHistorial, Pregunta, ProgresoSondeo, SubtemaEstado } from "./tipos";

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

db.exec("CREATE INDEX IF NOT EXISTS idx_preguntas_subtema ON preguntas(subtema_id, respondida)");
db.exec("CREATE INDEX IF NOT EXISTS idx_preguntas_sesion ON preguntas(sesion_id, descartada)");
db.exec("CREATE INDEX IF NOT EXISTS idx_subtemas_sesion ON subtemas(sesion_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_respuestas_pregunta ON respuestas(pregunta_id)");

// --- Tipos ------------------------------------------------------------------

export interface Sesion {
  id: number;
  topic: string;
  textoOriginal: string;
  faseActual: string;
  modelo: string | null;
  creadaEn: string;
  feedbackFinal: string | null;
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

function crearSesion(topic: string, textoOriginal: string, modelo: string | null = null): number {
  // El modelo se guarda: antes la columna existía pero quedaba siempre en NULL, así que
  // no había forma de saber con qué modelo se había generado una sesión.
  const result = db
    .prepare("INSERT INTO sesiones (topic, texto_original, modelo) VALUES (?, ?, ?)")
    .run(topic, textoOriginal, modelo);

  return Number(result.lastInsertRowid);
}

function obtenerSesion(sesionId: number): Sesion | null {
  const row = db
    .prepare(
      "SELECT id, topic, texto_original, fase_actual, modelo, creada_en, feedback_final FROM sesiones WHERE id = ?"
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

const eliminarSesion = db.transaction((sesionId: number): void => {
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

// --- Sub-temas --------------------------------------------------------------

function agregarSubtema(sesionId: number, nombre: string): number {
  const result = db.prepare("INSERT INTO subtemas (sesion_id, nombre) VALUES (?, ?)").run(sesionId, nombre);
  return Number(result.lastInsertRowid);
}

function obtenerSubtemas(sesionId: number): SubtemaEstado[] {
  const filas = db
    .prepare(
      `SELECT id, nombre, aciertos_seguidos, cubierto, total_correctas, total_intentos, total_incorrectas
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
    }[];

  return filas.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    aciertosSeguidos: fila.aciertos_seguidos,
    intentos: fila.total_intentos,
    correctas: fila.total_correctas,
    incorrectas: fila.total_incorrectas,
    cubierto: fila.cubierto === 1,
  }));
}

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
  const filas = db
    .prepare("SELECT contenido FROM preguntas WHERE subtema_id = ? AND descartada = 0 ORDER BY id")
    .all(subtemaId) as { contenido: string }[];

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
  obtenerSubtemas,
  obtenerSesion,
  elegirSiguienteSubtema,
  sondeoCompleto,
  guardarPregunta,
  guardarLotePreguntas,
  obtenerPreguntasSinResponder,
  obtenerPreguntasDelSubtema,
  registrarRespuesta,
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
