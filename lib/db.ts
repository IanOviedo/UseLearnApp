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

// 3. Export the database connection as the default export, nothing else.
export default db;
export { crearSesion, agregarSubtema };