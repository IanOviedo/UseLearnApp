import Database from "better-sqlite3";

// Cantidad de aciertos seguidos necesarios para considerar un subtema "cubierto".
const ACIERTOS_PARA_CUBRIR = 1;

const db = new Database("useLearn.db");

db.exec(`CREATE TABLE IF NOT EXISTS sesiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  texto_original TEXT NOT NULL,
  fase_actual TEXT NOT NULL DEFAULT 'sondeo',
  modelo TEXT,
  creada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

// Migración: agregar feedback_final si no existe todavía (para bases ya creadas)
const columnasSesiones = db.prepare("PRAGMA table_info(sesiones)").all() as { name: string }[];
const tieneFeedbackFinal = columnasSesiones.some(col => col.name === "feedback_final");
if (!tieneFeedbackFinal) {
  db.exec("ALTER TABLE sesiones ADD COLUMN feedback_final TEXT");
}


db.exec(`CREATE TABLE IF NOT EXISTS subtemas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sesion_id INTEGER NOT NULL REFERENCES sesiones(id),
  nombre TEXT NOT NULL,
  aciertos_seguidos INTEGER NOT NULL DEFAULT 0,
  cubierto INTEGER NOT NULL DEFAULT 0
)`);

// Migración: agregar total_incorrectas si no existe todavía (para bases ya creadas)
const columnasSubtemas = db.prepare("PRAGMA table_info(subtemas)").all() as { name: string }[];
const tieneTotalIncorrectas = columnasSubtemas.some(col => col.name === "total_incorrectas");
if (!tieneTotalIncorrectas) {
  db.exec("ALTER TABLE subtemas ADD COLUMN total_incorrectas INTEGER NOT NULL DEFAULT 0");
}

db.exec(`CREATE TABLE IF NOT EXISTS preguntas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sesion_id INTEGER NOT NULL REFERENCES sesiones(id),
  subtema_id INTEGER NOT NULL REFERENCES subtemas(id),
  fase TEXT NOT NULL,
  contenido TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('multiple_choice', 'libre'))
)`);

// Migración: agregar respondida si no existe todavía (para bases ya creadas)
const columnasPreguntas = db.prepare("PRAGMA table_info(preguntas)").all() as { name: string }[];
const tieneRespondida = columnasPreguntas.some(col => col.name === "respondida");
if (!tieneRespondida) {
  db.exec("ALTER TABLE preguntas ADD COLUMN respondida INTEGER NOT NULL DEFAULT 0");
}

db.exec(`CREATE TABLE IF NOT EXISTS respuestas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pregunta_id INTEGER NOT NULL REFERENCES preguntas(id),
  respuesta_usuario TEXT NOT NULL,
  correcta INTEGER NOT NULL,
  corregido_en TEXT
)`);

function crearSesion(topic: string, textoOriginal: string): number {
  const result = db.prepare("INSERT INTO sesiones (topic, texto_original) VALUES (?, ?)")
    .run(topic, textoOriginal);
  return Number(result.lastInsertRowid);
}

function agregarSubtema(sesionId: number, nombre: string): number {
  const result = db.prepare("INSERT INTO subtemas (sesion_id, nombre) VALUES (?, ?)")
    .run(sesionId, nombre);
  return Number(result.lastInsertRowid);
}

function actualizarAciertos(subtemaId: number, correcta: boolean): void {
  const statement = db.prepare("SELECT aciertos_seguidos, cubierto FROM subtemas WHERE id = ?");
  const row = statement.get(subtemaId) as { aciertos_seguidos: number, cubierto: number } | undefined;

  if (!row) {
    return;
  }

  if (correcta) {
    const newAciertos = row.aciertos_seguidos + 1;
    const newCubierto = newAciertos >= ACIERTOS_PARA_CUBRIR ? 1 : row.cubierto;

    db.prepare("UPDATE subtemas SET aciertos_seguidos = ?, cubierto = ? WHERE id = ?")
      .run(newAciertos, newCubierto, subtemaId);
  } else {
    // Al fallar, aciertos_seguidos vuelve a 0, así que el subtema deja de estar cubierto en el mismo UPDATE
    db.prepare("UPDATE subtemas SET aciertos_seguidos = 0, cubierto = 0, total_incorrectas = total_incorrectas + 1 WHERE id = ?")
      .run(subtemaId);
  }
}

function obtenerSubtemas(sesionId: number): { id: number, nombre: string, aciertosSeguidos: number, cubierto: boolean, totalIncorrectas: number }[] {
  const results = db.prepare("SELECT id, nombre, aciertos_seguidos, cubierto, total_incorrectas FROM subtemas WHERE sesion_id = ?")
    .all(sesionId) as { id: number, nombre: string, aciertos_seguidos: number, cubierto: number, total_incorrectas: number }[];

  return results.map(row => ({
    id: row.id,
    nombre: row.nombre,
    aciertosSeguidos: row.aciertos_seguidos,
    cubierto: row.cubierto === 1,
    totalIncorrectas: row.total_incorrectas
  }));
}

function obtenerSesion(sesionId: number): { id: number, topic: string, textoOriginal: string, faseActual: string, modelo: string | null, feedbackFinal: string | null } | null {
  const statement = db.prepare("SELECT id, topic, texto_original, fase_actual, modelo, feedback_final FROM sesiones WHERE id = ?");
  const row = statement.get(sesionId) as { id: number, topic: string, texto_original: string, fase_actual: string, modelo: string | null, feedback_final: string | null } | undefined;
  return row ? {
    id: row.id,
    topic: row.topic,
    textoOriginal: row.texto_original,
    faseActual: row.fase_actual,
    modelo: row.modelo,
    feedbackFinal: row.feedback_final
  } : null;
}

function elegirSiguienteSubtema(sesionId: number): { id: number, nombre: string, aciertosSeguidos: number, cubierto: boolean } | null {
  const subtemas = obtenerSubtemas(sesionId);
  const disponibles = subtemas.filter(subtema => !subtema.cubierto);

  if (disponibles.length === 0) {
    return null;
  }

  let minAciertos = Infinity;
  for (const subtema of disponibles) {
    if (subtema.aciertosSeguidos < minAciertos) {
      minAciertos = subtema.aciertosSeguidos;
    }
  }

  const siguientes = disponibles.filter(subtema => subtema.aciertosSeguidos === minAciertos);
  return siguientes[0];
}

function sondeoCompleto(sesionId: number): boolean {
  const subtemas = obtenerSubtemas(sesionId);
  if (subtemas.length === 0) {
    return false;
  }
  return subtemas.every(subtema => subtema.cubierto);
}
function guardarPregunta(sesionId: number, subtemaId: number, fase: string, contenido: string, tipo: string): number {
  const resultado = db.prepare("INSERT INTO preguntas (sesion_id, subtema_id, fase, contenido, tipo) VALUES (?, ?, ?, ?, ?)")
    .run(sesionId, subtemaId, fase, contenido, tipo);
  return Number(resultado.lastInsertRowid);
}

function obtenerPreguntasPrevias(sesionId: number): string[] {
  const rows = db.prepare("SELECT contenido FROM preguntas WHERE sesion_id = ?")
    .all(sesionId) as { contenido: string }[];

  return rows.map(row => {
    try {
      const parsed = JSON.parse(row.contenido);
      return typeof parsed.pregunta === "string" ? parsed.pregunta : "";
    } catch {
      return "";
    }
  }).filter(texto => texto.length > 0);
}

function obtenerPreguntasSinResponder(subtemaId: number): { id: number; contenido: string }[] {
  return db.prepare("SELECT id, contenido FROM preguntas WHERE subtema_id = ? AND respondida = 0")
    .all(subtemaId) as { id: number; contenido: string }[];
}

function marcarPreguntaRespondida(preguntaId: number): void {
  db.prepare("UPDATE preguntas SET respondida = 1 WHERE id = ?").run(preguntaId);
}

function guardarFeedbackFinal(sesionId: number, feedback: string): void {
  db.prepare("UPDATE sesiones SET feedback_final = ? WHERE id = ?").run(feedback, sesionId);
}

function listarSesionesConEstado(): {
  id: number;
  creadoEn: string;
  completa: boolean;
  totalPreguntas: number;
  preguntasRespondidas: number;
}[] {
  const sesiones = db.prepare("SELECT id, creada_en, feedback_final FROM sesiones ORDER BY creada_en DESC")
    .all() as { id: number, creada_en: string, feedback_final: string | null }[];

  const conteos = db.prepare(
    "SELECT sesion_id, COUNT(*) AS total, COALESCE(SUM(respondida), 0) AS respondidas FROM preguntas GROUP BY sesion_id"
  ).all() as { sesion_id: number, total: number, respondidas: number }[];

  const conteosPorSesion = new Map(conteos.map(conteo => [conteo.sesion_id, conteo]));

  return sesiones.map(sesion => {
    const conteo = conteosPorSesion.get(sesion.id);
    return {
      id: sesion.id,
      creadoEn: sesion.creada_en,
      completa: sesion.feedback_final !== null,
      totalPreguntas: conteo?.total ?? 0,
      preguntasRespondidas: conteo?.respondidas ?? 0,
    };
  });
}

function contarPreguntasSesion(sesionId: number): { respondidas: number, total: number } {
  const row = db.prepare(
    "SELECT COUNT(*) AS total, COALESCE(SUM(respondida), 0) AS respondidas FROM preguntas WHERE sesion_id = ?"
  ).get(sesionId) as { total: number, respondidas: number } | undefined;

  return {
    respondidas: row?.respondidas ?? 0,
    total: row?.total ?? 0,
  };
}

const eliminarSesion = db.transaction((sesionId: number): void => {
  db.prepare("DELETE FROM respuestas WHERE pregunta_id IN (SELECT id FROM preguntas WHERE sesion_id = ?)").run(sesionId);
  db.prepare("DELETE FROM preguntas WHERE sesion_id = ?").run(sesionId);
  db.prepare("DELETE FROM subtemas WHERE sesion_id = ?").run(sesionId);
  db.prepare("DELETE FROM sesiones WHERE id = ?").run(sesionId);
});


export default db;
export { crearSesion, agregarSubtema, obtenerSubtemas, actualizarAciertos, obtenerSesion, elegirSiguienteSubtema, sondeoCompleto, guardarPregunta, obtenerPreguntasPrevias, obtenerPreguntasSinResponder, marcarPreguntaRespondida, guardarFeedbackFinal, listarSesionesConEstado, eliminarSesion, contarPreguntasSesion };

