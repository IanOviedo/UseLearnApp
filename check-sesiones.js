const db = require("better-sqlite3")("uselearn.db");
console.log(db.prepare("SELECT id, titulo, topic FROM chat_sessions ORDER BY fecha_creacion DESC LIMIT 5").all());
