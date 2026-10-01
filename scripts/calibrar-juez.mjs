// Calibración del juez semántico contra el set golden.
//
// Por qué esto es un script y no un test unitario: la pregunta que responde es "¿el juez, con un
// modelo real, descarta lo que debe y conserva lo que debe?", y eso solo se mide llamando al modelo.
// Un assert fijo no avisaría si el prompt del juez cambia y pasa a ser demasiado severo.
//
// LA MÉTRICA que importa no es la tasa global de descarte, sino dos números separados:
//   - recall de las malas: cuántas de las etiquetadas como 'mala' detecta.
//   - falsos positivos: cuántas de las etiquetadas como 'buena' descarta.
// Un juez que descarta el 100% tiene recall 1 y falsos positivos 100: inusable. Por eso una tasa
// global del "60%" no dice nada.
//
// Uso: node scripts/calibrar-juez.mjs [modelo] [--reporte-nuevos]
//   --reporte-nuevos  vuelca los reportes del botón "esta pregunta está mal" como casos,
//                     para poder copiar los que sirvan al golden set.
import fs from "node:fs";
import path from "node:path";

const MODELO = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "gemma4:e2b";
const VOLCAR_REPORTES = process.argv.includes("--reporte-nuevos");
const RUTA_SET = path.join("tests", "golden", "juez-casos.json");
const RUTA_SALIDA = path.join("tests", "golden", "reportes-para-set.json");

const set = JSON.parse(fs.readFileSync(RUTA_SET, "utf8"));
const casos = set.casos;

console.log(`Modelo: ${MODELO}`);
console.log(`Set: ${RUTA_SET} (${casos.length} casos)`);

// --- Volcar reportes reales como candidatos a casos --------------------------
if (VOLCAR_REPORTES) {
  const Database = (await import("better-sqlite3")).default;
  const db = new Database("useLearn.db", { readonly: true });
  const existe = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'reportes_pregunta'")
    .get();
  if (!existe) {
    console.log("No hay tabla reportes_pregunta todavía.");
    process.exit(0);
  }
  const reportes = db
    .prepare(
      `SELECT r.id, r.motivo, r.contenido, r.subtema_id, s.nombre AS subtema, s.sesion_id,
              ses.texto_original
         FROM reportes_pregunta r
         JOIN subtemas s ON s.id = r.subtema_id
         JOIN sesiones ses ON ses.id = r.sesion_id
        ORDER BY r.id`
    )
    .all();

  const candidatos = reportes.map((r) => ({
    id: `reporte-${r.id}`,
    esperada: "mala",
    motivo: r.motivo,
    subtema: r.subtema,
    sesionId: r.sesion_id,
    texto: r.texto_original,
    pregunta: JSON.parse(r.contenido),
    nota: `Reportado por el usuario en la sesión ${r.sesion_id}. Revisalo antes de copiarlo al set:` +
      ` el motivo es del usuario, no una etiqueta verificada.`,
  }));

  fs.writeFileSync(RUTA_SALIDA, JSON.stringify({ _comentario: [
    "Casos mala derivados del botón \"esta pregunta está mal\".",
    "NO son gold: el motivo lo eligió el usuario y el texto de referencia es el apunte entero.",
    "Revisá uno por uno antes de copiarlo a juez-casos.json.",
  ], candidatos }, null, 2));
  console.log(`\n${candidatos.length} reportes vuelcados a ${RUTA_SALIDA}.`);
  console.log("Revisalos y copiá los que sirvan al set a mano: el motivo es del usuario, no una");
  console.log("etiqueta verificada, y un golden set contaminado es peor que uno chico.");
  process.exit(0);
}


// --- Correr el juez ---------------------------------------------------------
// Se replica el prompt de lib/evaluador.ts en vez de importar el módulo: Node no resuelve los
// imports sin extensión de un proyecto de Next, y copiar el prompt a ciegas sería peor que no
// medir nada. El texto es el mismo que usa el módulo en producción.
const ESQUEMA_JUEZ = {
  type: "object",
  properties: {
    valida: { type: "boolean" },
    motivo: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["valida", "motivo"],
};

const CRITERIOS = `CRITERIOS DE EVALUACIÓN (si falla cualquiera, la pregunta NO es válida):
1. VERACIDAD: ¿la opción marcada como correcta es realmente la correcta según el TEXTO DE REFERENCIA?
2. CLARIDAD: ¿el enunciado es claro y no admite más de una respuesta correcta?
3. RELEVANCIA: ¿la pregunta trata sobre el tema del texto y se puede responder SOLO con el texto?
4. NO CONTRADICCIÓN: ¿la explicación justifica la opción marcada como correcta?`;

function construirPrompt(caso) {
  const p = caso.pregunta;
  return `Sos un experto en control de calidad de contenidos educativos.
Tu tarea es evaluar si una pregunta de opción múltiple es correcta y de alta calidad basándote en un texto de referencia.

TEXTO DE REFERENCIA:
"""
${caso.texto}
"""

PREGUNTA A EVALUAR:
- Enunciado: "${p.pregunta}"
- Opciones: ${JSON.stringify(p.opciones)}
- Respuesta correcta (índice ${p.indiceCorrecta}): "${p.opciones[p.indiceCorrecta] ?? "(no existe esa opción)"}"
- Explicación: "${p.explicacion}"

${CRITERIOS}

Ojo: el TEXTO puede estar truncado. Si la pregunta se responde con una parte del texto
que no está en el excerpt, no la invalides por eso: judgedla solo por lo que ves.

RESPONDE ÚNICAMENTE en formato JSON con esta estructura:
{
  "valida": boolean,
  "motivo": "breve explicación de por qué es inválida si valida es false, sino null"
}

Si la pregunta es buena, "valida" debe ser true y "motivo" null.`;
}

async function juzgar(caso) {
  const t0 = Date.now();
  try {
    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        prompt: construirPrompt(caso),
        stream: false,
        think: false,
        format: ESQUEMA_JUEZ,
        options: { temperature: 0.2, num_ctx: 8192, num_predict: 120 },
        keep_alive: "30m",
      }),
    });
    const j = await res.json();
    const parsed = JSON.parse(j.response);
    // Mismo criterio que lib/evaluador.ts: solo el booleano real cuenta como veredicto.
    return { valida: parsed.valida === true, motivo: parsed.motivo ?? null, ms: Date.now() - t0 };
  } catch (error) {
    // Fail-open, igual que el módulo: un juez caído no invalida nada.
    return { valida: true, motivo: `fallo: ${error.message}`, ms: Date.now() - t0 };
  }
}

console.log("\nCorriendo el juez sobre el set (una llamada por caso)...\n");
const t0 = Date.now();
const veredictos = await Promise.all(casos.map(juzgar));

const filas = casos.map((caso, i) => ({
  id: caso.id,
  esperada: caso.esperada,
  motivo: caso.motivo ?? "",
  detectadaMala: veredictos[i].valida === false,
  motivoJuez: veredictos[i].motivo,
  ms: veredictos[i].ms,
}));

const malas = filas.filter((f) => f.esperada === "mala");
const buenas = filas.filter((f) => f.esperada === "buena");
const detectadas = malas.filter((f) => f.detectadaMala);
const falsosPositivos = buenas.filter((f) => f.detectadaMala);
const pct = (x) => `${(x * 100).toFixed(0)}%`;

console.log("Detalle:");
for (const f of filas) {
  const acierto = f.esperada === "mala" ? f.detectadaMala : !f.detectadaMala;
  console.log(
    `  [${acierto ? "ok   " : "FALLA"}] ${(f.esperada === "mala" ? "descartar" : "aceptar ")} ` +
      `${f.id.padEnd(28)} ${(f.ms / 1000).toFixed(1)}s  ${f.motivoJuez ?? ""}`
  );
}

const recall = malas.length ? detectadas.length / malas.length : 0;
const falsos = buenas.length ? falsosPositivos.length / buenas.length : 0;
const descarte = filas.length ? filas.filter((f) => f.detectadaMala).length / filas.length : 0;

console.log(`\nMétricas (${((Date.now() - t0) / 1000).toFixed(1)}s en total)`);
console.log(`  recall de las malas:      ${detectadas.length}/${malas.length} = ${pct(recall)}`);
console.log(`  falsos positivos:        ${falsosPositivos.length}/${buenas.length} = ${pct(falsos)}`);
console.log(`  tasa global de descarte: ${filas.filter((f) => f.detectadaMala).length}/${filas.length} = ${pct(descarte)}`);

console.log("\nMalas que se le escaparon:");
const escapadas = malas.filter((f) => !f.detectadaMala);
if (escapadas.length === 0) console.log("  (ninguna)");
for (const f of escapadas) console.log(`  - ${f.id} [${f.motivo}]: el juez la aceptó`);

console.log("\nBuenas que descartó:");
if (falsosPositivos.length === 0) console.log("  (ninguna)");
for (const f of falsosPositivos) console.log(`  - ${f.id}: ${f.motivoJuez ?? ""}`);

// El criterio no es arbitrario: un juez que no detecta la mitad de las malas no sirve, y uno que
// descarta un tercio de las buenas deja al usuario sin preguntas (§7). Un juez que descarta el
// 100% tendría recall 1 y falsos positivos 100: por eso el recall solo no alcanza.
const RECALL_MINIMO = 0.5;
const FALSOS_MAXIMO = 1 / 3;
const veredicto = recall >= RECALL_MINIMO && falsos <= FALSOS_MAXIMO;
console.log(`\nCriterio: recall >= ${RECALL_MINIMO} y falsos positivos <= ${FALSOS_MAXIMO.toFixed(2)}`);
console.log(
  veredicto
    ? "  VEREDICTO: el juez es usable con estos números."
    : "  VEREDICTO: el juez todavía no es usable (ver §7 de ESTADO.md)."
);

process.exit(veredicto ? 0 : 1);
