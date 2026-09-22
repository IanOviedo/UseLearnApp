import { db } from './index';

export const crearSesion = (topic: string) => {
  const stmt = db.prepare(
    `INSERT INTO sessions (topic, fecha_inicio, fase_actual) VALUES (?, datetime('now'), ?)`
  );
  const info = stmt.run(topic, 'sondeo');
  return info.lastInsertRowid as number;
};

export const actualizarFaseSesion = (sessionId: number, fase: string) => {
  const stmt = db.prepare(
    `UPDATE sessions SET fase_actual = ?, fecha_actualizacion = datetime('now') WHERE id = ?`
  );
  return stmt.run(fase, sessionId);
};

export const guardarIntento = (
  sessionId: number,
  pregunta: string,
  respuestaUsuario: string,
  correcta: boolean,
  explicacion: string
) => {
  const stmt = db.prepare(
    `INSERT INTO attempts (session_id, pregunta, respuesta_usuario, correcta, explicacion, fecha) VALUES (?, ?, ?, ?, ?, datetime('now'))`
  );
  return stmt.run(
    sessionId,
    pregunta,
    respuestaUsuario,
    correcta ? 1 : 0,
    explicacion
  );
};

export const guardarScore = (
  sessionId: number,
  categoria: string,
  puntaje: number
) => {
  const stmt = db.prepare(
    `INSERT INTO scores (session_id, categoria, puntaje, fecha) VALUES (?, ?, ?, datetime('now'))`
  );
  return stmt.run(sessionId, categoria, puntaje);
};

export const obtenerProgresoSesion = (sessionId: number) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return null;
  const attempts = db
    .prepare('SELECT * FROM attempts WHERE session_id = ? ORDER BY fecha')
    .all(sessionId);
  const scores = db
    .prepare('SELECT * FROM scores WHERE session_id = ? ORDER BY fecha')
    .all(sessionId);
  return { session, attempts, scores };
};

export const obtenerHistorialScoresPorCategoria = (categoria: string) => {
  return db
    .prepare('SELECT * FROM scores WHERE categoria = ? ORDER BY fecha DESC')
    .all(categoria);
};

export const obtenerTodasLasSesiones = () => {
  return db
    .prepare('SELECT * FROM sessions ORDER BY fecha_inicio DESC')
    .all();
};

export const actualizarTopicSiVacio = (sessionId: number, topic: string) => {
  const stmt = db.prepare(
    `UPDATE chat_sessions SET topic = ? WHERE id = ? AND (topic IS NULL OR topic = '')`
  );
  return stmt.run(topic, sessionId);
};

// ----------- New chat-related queries -----------
export const crearChatSession = (titulo: string, modeloChat: string, modeloRevisor: string) => {
  const stmt = db.prepare(
    `INSERT INTO chat_sessions (titulo, modelo_chat, modelo_revisor) VALUES (?, ?, ?)`
  );
  const info = stmt.run(titulo, modeloChat, modeloRevisor);
  const sessionId = info.lastInsertRowid as number;
  // Insert initial assistant message for new chat session
  const msgStmt = db.prepare(
    `INSERT INTO chat_messages (session_id, rol, contenido) VALUES (?, ?, ?)`
  );
  msgStmt.run(
    sessionId,
    'assistant',
    '¡Hola! Pegá el texto o tus notas sobre lo que querés aprender hoy, y armamos un quiz juntos.'
  );
  return sessionId;
};

export const obtenerChatSessions = () => {
  return db.prepare('SELECT * FROM chat_sessions ORDER BY fecha_creacion DESC').all();
};

export const obtenerMensajes = (sessionId: number) => {
  return db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY fecha ASC').all(sessionId);
};

export const guardarMensajeTipado = (sessionId: number, rol: string, contenido: string, tipo: string) => {
  const stmt = db.prepare(
    `INSERT INTO chat_messages (session_id, rol, contenido, tipo) VALUES (?, ?, ?, ?)`
  );
  return stmt.run(sessionId, rol, contenido, tipo);
}

export const guardarMensaje = (sessionId: number, rol: string, contenido: string) => {
  const stmt = db.prepare(
    `INSERT INTO chat_messages (session_id, rol, contenido) VALUES (?, ?, ?)`
  );
  return stmt.run(sessionId, rol, contenido);
};

export const actualizarFaseChatSesion = (sessionId: number, fase: string) => {
  const stmt = db.prepare(
    `UPDATE chat_sessions SET fase_actual = ? WHERE id = ?`
  );
  return stmt.run(fase, sessionId);
};
