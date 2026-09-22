const db = require("better-sqlite3")("uselearn.db");
const rows = db.prepare("SELECT id, contenido FROM chat_messages WHERE session_id = 11 AND tipo = 'pregunta' ORDER BY id DESC LIMIT 2").all();
console.log(JSON.stringify(rows, null, 2));
console.log("---topic---");
console.log(db.prepare("SELECT topic FROM chat_sessions WHERE id = 11").get());
