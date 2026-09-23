import Database from "better-sqlite3";

// 1. Open (or create) a SQLite database file at the project root called useLearn.db
const db = new Database("useLearn.db");

// 2. Create these four tables if they don't already exist, using the specified schema.
// The schema must be executed sequentially.

// sessions table
db.exec(`CREATE TABLE IF NOT EXISTS sesiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  texto_original TEXT NOT NULL,
  fase_actual TEXT NOT NULL DEFAULT 'sondeo',
  modelo TEXT,
  creada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

// subtemas table
db.exec(`CREATE TABLE IF NOT EXISTS subtemas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sesion_id INTEGER NOT NULL REFERENCES sesiones(id),
  nombre TEXT NOT NULL,
  aciertos_seguidos INTEGER NOT NULL DEFAULT 0,
  cubierto INTEGER NOT NULL DEFAULT 0
)`);

// preguntas table
db.exec(`CREATE TABLE IF NOT EXISTS preguntas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sesion_id INTEGER NOT NULL REFERENCES sesiones(id),
  subtema_id INTEGER NOT NULL REFERENCES subtemas(id),
  fase TEXT NOT NULL,
  contenido TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('multiple_choice', 'libre'))
)`);

// respuestas table
db.exec(`CREATE TABLE IF NOT EXISTS respuestas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pregunta_id INTEGER NOT NULL REFERENCES preguntas(id),
  respuesta_usuario TEXT NOT NULL,
  correcta INTEGER NOT NULL,
  corregido_en TEXT
)`);

// Function to create a new session
function crearSesion(topic: string, textoOriginal: string): number {
  const result = db.prepare("INSERT INTO sesiones (topic, texto_original) VALUES (?, ?)")
    .run(topic, textoOriginal);
  return Number(result.lastInsertRowid);
}

// Function to add a new subtema
function agregarSubtema(sesionId: number, nombre: string): number {
  const result = db.prepare("INSERT INTO subtemas (sesion_id, nombre) VALUES (?, ?)")
    .run(sesionId, nombre);
  return Number(result.lastInsertRowid);
}

// Function to update subtema scores
function actualizarAciertos(subtemaId: number, correcta: boolean): void {
  const statement = db.prepare("SELECT aciertos_seguidos, cubierto FROM subtemas WHERE id = ?");
  const row = statement.get(subtemaId) as { aciertos_seguidos: number, cubierto: number } | undefined;

  if (!row) {
    return; // Subtema not found
  }

  if (correcta) {
    const newAciertos = row.aciertos_seguidos + 1;
    const newCubierto = newAciertos >= 2 ? 1 : row.cubierto;

    db.prepare("UPDATE subtemas SET aciertos_seguidos = ?, cubierto = ? WHERE id = ?")
        .run(newAciertos, newCubierto, subtemaId);
  } else {
    // Reset score if incorrect
    db.prepare("UPDATE subtemas SET aciertos_seguidos = 0 WHERE id = ?")
        .run(subtemaId);
  }
}

// Function to get subtemas for a session
function obtenerSubtemas(sesionId: number): { id: number, nombre: string, aciertosSeguidos: number, cubierto: boolean }[] {
  const results = db.prepare("SELECT id, nombre, aciertos_seguidos, cubierto FROM subtemas WHERE sesion_id = ?")
    .all(sesionId) as { id: number, nombre: string, aciertos_seguidos: number, cubierto: number }[];

  return results.map(row => ({
    id: row.id,
    nombre: row.nombre,
    aciertosSeguidos: row.aciertos_seguidos,
    cubierto: row.cubierto === 1
  }));
}

// Function to get session details by ID
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

// 3. Export the database connection as the default export, nothing else.
export default db;
export { crearSesion, agregarSubtema, obtenerSubtemas, actualizarAciertos, obtenerSesion };