const db = require("better-sqlite3")("uselearn.db");
const rows = db.prepare("SELECT id, rol, tipo, contenido FROM chat_messages WHERE tipo = 'pregunta' ORDER BY id DESC LIMIT 1").all();
console.log(JSON.stringify(rows, null, 2));