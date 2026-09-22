const db = require("better-sqlite3")("uselearn.db");
console.log(db.prepare("PRAGMA table_info(chat_sessions)").all());
console.log(db.prepare("PRAGMA table_info(chat_messages)").all());
