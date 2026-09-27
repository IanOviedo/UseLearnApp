import Database from "better-sqlite3";

const db = new Database("useLearn.db");

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
    const newCubierto = newAciertos >= 2 ? 1 : row.cubierto;

    db.prepare("UPDATE subtemas SET aciertos_seguidos = ?, cubierto = ? WHERE id = ?")
      .run(newAciertos, newCubierto, subtemaId);
  } else {
    db.prepare("UPDATE subtemas SET aciertos_seguidos = 0, total_incorrectas = total_incorrectas + 1 WHERE id = ?")
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

function obtenerSesion(sesionId: number): { id: number, topic: string, textoOriginal: string, faseActual: string, modelo: string | null } | null {
  const statement = db.prepare("SELECT id, topic, texto_original, fase_actual, modelo FROM sesiones WHERE id = ?");
  const row = statement.get(sesionId) as { id: number, topic: string, texto_original: string, fase_actual: string, modelo: string | null } | undefined;
  return row ? {
    id: row.id,
    topic: row.topic,
    textoOriginal: row.texto_original,
    faseActual: row.fase_actual,
    modelo: row.modelo
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
function guardarPregunta(sesionId: number, subtemaId: number, fase: string, contenido: string, tipo: string): void {
  db.prepare("INSERT INTO preguntas (sesion_id, subtema_id, fase, contenido, tipo) VALUES (?, ?, ?, ?, ?)")
    .run(sesionId, subtemaId, fase, contenido, tipo);
}

function obtenerPreguntasPrevias(sesionId: number, subtemaId: number): string[] {
  const rows = db.prepare("SELECT contenido FROM preguntas WHERE sesion_id = ? AND subtema_id = ?")
    .all(sesionId, subtemaId) as { contenido: string }[];

  return rows.map(row => {
    try {
      const parsed = JSON.parse(row.contenido);
      return typeof parsed.pregunta === "string" ? parsed.pregunta : "";
    } catch {
      return "";
    }
  }).filter(texto => texto.length > 0);
}


export default db;
export { crearSesion, agregarSubtema, obtenerSubtemas, actualizarAciertos, obtenerSesion, elegirSiguienteSubtema, sondeoCompleto, guardarPregunta, obtenerPreguntasPrevias };

