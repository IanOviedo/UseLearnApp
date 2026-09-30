// .smoke-fase-cd-db.mjs — helper del smoke de Fases C/D.
// Simula el resultado del sondeo escribiendo directo en la base (controla exactamente
// qué rutas debería calcular el plan: reforzar / practicar / sin_evaluar), en vez de
// emular el flujo completo de preguntas y respuestas.
// ESM (.mjs) a propósito: el repo lint-ea con `no-require-imports`, así el helper no
// necesita un ignore propio en eslint.config.mjs.
//
// Uso:
//   USELEARN_DB=<base> node .smoke-fase-cd-db.mjs <sesionId> <ruta del json de estados>
// Donde cada estado es { id, intentos, correctas, incorrectas, cubierto }.
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

const db = new Database(process.env.USELEARN_DB);
// El JSON viene por ARCHIVO: pasarlo como argumento a un proceso nativo desde
// PowerShell se come las comillas (ConvertTo-Json → JS sin comillas → SyntaxError).
const [sesionId, rutaJson] = process.argv.slice(2);
// .replace(/^\uFEFF/): Windows PowerShell escribe el archivo con BOM UTF-8 y JSON.parse
// revienta con "Unexpected token".
const estados = JSON.parse(readFileSync(rutaJson, "utf8").replace(/^\uFEFF/, ""));

const tx = db.transaction(() => {
  for (const e of estados) {
    db.prepare(
      `UPDATE subtemas
         SET total_intentos = ?, total_correctas = ?, total_incorrectas = ?,
             cubierto = ?, aciertos_seguidos = ?
       WHERE sesion_id = ? AND id = ?`
    ).run(
      e.intentos,
      e.correctas,
      e.incorrectas,
      e.cubierto ? 1 : 0,
      e.cubierto ? 2 : 0,
      sesionId,
      e.id
    );
  }
  // Es lo que hace finalizarSondeo: feedback + fase "plan" en la misma escritura.
  db.prepare(
    "UPDATE sesiones SET fase_actual = 'plan', feedback_final = ? WHERE id = ?"
  ).run("Feedback simulado del smoke: bien en general, hay que reforzar lo marcado.", sesionId);
});

tx();

// Guarda anti-base-equivocada: si la sesión no existe en ESTA base, las updates no
// tocaron nada y el smoke seguiría de frente con datos falsos.
const tocados = db
  .prepare("SELECT COUNT(*) AS n FROM subtemas WHERE sesion_id = ?")
  .get(sesionId);
if (!tocados || tocados.n !== estados.length) {
  console.error(
    "FAIL: la sesión",
    sesionId,
    "no tiene",
    estados.length,
    "sub-temas en",
    process.env.USELEARN_DB,
    "(¿base equivocada?)"
  );
  process.exit(1);
}

console.log("OK: sondeo simulado para la sesión", sesionId);
db.close();