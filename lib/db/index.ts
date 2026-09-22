import Database from 'better-sqlite3';
import { join } from 'path';

const dbPath = join(process.cwd(), 'uselearn.db');

// Initialize connection
const db = new Database(dbPath, { verbose: console.log });

// Create tables if they don't exist
const init = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      fase_actual TEXT,
      fecha_inicio TEXT,
      fecha_actualizacion TEXT
    );

    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      categoria TEXT,
      puntaje INTEGER,
      fecha TEXT,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      pregunta TEXT,
      respuesta_usuario TEXT,
      correcta INTEGER,
      explicacion TEXT,
      fecha TEXT,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT,
      modelo_chat TEXT,
      modelo_revisor TEXT,
      fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER REFERENCES chat_sessions(id),
      rol TEXT CHECK(rol IN ('user','assistant','revisor')),
      contenido TEXT,
      fecha TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Add new columns if they do not exist
  try {
    db.exec(`ALTER TABLE chat_sessions ADD COLUMN fase_actual TEXT DEFAULT 'inicio';`);
  } catch {
    // ignore if column exists
  }
  try {
    db.exec(`ALTER TABLE chat_sessions ADD COLUMN topic TEXT;`);
  } catch {
    // ignore
  }
  try {
    db.exec(`ALTER TABLE chat_messages ADD COLUMN tipo TEXT DEFAULT 'chat';`);
  } catch {
    // ignore
  }
};

init();

export { db };
