// Humo de la fase Enseñar/Practicar: los tres cambios de esta tanda.
//   1. El bloque devuelve `diagnostico` (localiza en qué capa se pierde un ejercicio).
//   2. La anti-repetición: el route pasa los previos y el parser descarta lo parecido.
//   3. "Saltar" persiste y no toca el dominio.
//
// Uso: node .smoke-ensenar.mjs <baseUrl> <modelo>   (con USELEARN_DB en una base temporal)
const BASE = process.argv[2] ?? "http://localhost:3113";
const MODELO = process.argv[3] ?? "gemma3:4b";

let fallos = 0;
function ok(nombre, cond, detalle = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${nombre}${detalle ? `  (${detalle})` : ""}`);
  if (!cond) fallos += 1;
}

const llamar = async (metodo, ruta, body) => {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

const APUNTE = [
  "Los closures en JavaScript son funciones que conservan el ámbito donde fueron creadas.",
  "",
  "Ejemplo clasico: en un bucle con for (var i = 0) todas las funciones devueltas comparten la",
  "misma referencia a i, mientras que con let cada iteracion crea un ambito nuevo.",
  "",
  "Otros conceptos: ambito de bloque, hoisting y diferencias entre var, let y const.",
].join("\n");

console.log("1. Levantar una sesión hasta la fase de enseñar");
const creada = await llamar("POST", "/api/sesiones/crear", {
  texto: APUNTE,
  modeloPrincipal: MODELO,
  modeloPreguntas: MODELO,
  preset: "rapido",
});
const SESION = creada.data.sesionId;
const SUBTEMAS = creada.data.subtemas ?? [];
ok("sesión creada con sub-temas", Boolean(SESION) && SUBTEMAS.length > 0, `${SUBTEMAS.length} sub-temas`);
if (!SESION) {
  console.log("  no se pudo seguir");
  process.exit(1);
}


const ids = SUBTEMAS.map((s) => s.id);
// El route de bloque exige fase "ensenar" o "cerrar" (409 antes del plan).
await llamar("POST", `/api/sesiones/${SESION}/fase`, { fase: "ensenar" });

console.log("\n2. Pedir el bloque del primer sub-tema");
const bloque = await llamar("POST", "/api/aprender/bloque", {
  sesionId: SESION,
  subtemaId: ids[0],
  modeloPrincipal: MODELO,
  preset: "rapido",
});
ok("el bloque respondió ok", bloque.status === 200, bloque.data.error ?? "");
ok("viene el bloque `diagnostico`", typeof bloque.data.diagnostico === "object");
ok(
  "el diagnóstico tiene los números",
  typeof bloque.data.diagnostico?.servidos === "number",
  JSON.stringify(bloque.data.diagnostico ?? {})
);
ok(
  "los ids coinciden con los ejercicios servidos",
  Array.isArray(bloque.data.diagnostico?.ids) &&
    bloque.data.diagnostico.ids.length === (bloque.data.ejercicios ?? []).length
);
console.log(`      diagnóstico: ${JSON.stringify(bloque.data.diagnostico)}`);
ok(
  "servidos = número de ejercicios",
  bloque.data.diagnostico?.servidos === (bloque.data.ejercicios ?? []).length,
  `${bloque.data.diagnostico?.servidos} vs ${(bloque.data.ejercicios ?? []).length}`
);

console.log("\n3. Anti-repetición entre sub-temas");
const bloque2 = await llamar("POST", "/api/aprender/bloque", {
  sesionId: SESION,
  subtemaId: ids[1] ?? ids[0],
  modeloPrincipal: MODELO,
  preset: "rapido",
});
ok("el segundo sub-tema también generó", bloque2.status === 200, bloque2.data.error ?? "");
ok(
  "el route pasa los previos ya vistos",
  (bloque2.data.diagnostico?.pedidosPrevios ?? 0) > 0,
  `previos=${bloque2.data.diagnostico?.pedidosPrevios}`
);

const VACIAS = new Set(["de","del","la","el","los","las","un","una","y","o","en","con","sin","para","por","que","al","a","su","es","son","como","sobre","entre","lo","se","mas","más","muy"]);

console.log("\n4. Saltar un sub-tema");
const salta = await llamar("POST", "/api/aprender/saltar", { subtemaId: ids[0], saltado: true });
ok("marca saltado", salta.data.ok === true && salta.data.saltado === true, JSON.stringify(salta.data));

const estado = await llamar("GET", `/api/sesiones/${SESION}`);
const subTrasSalto = (estado.data.subtemas ?? []).find((s) => s.id === ids[0]);
ok("el estado de la sesión lo refleja", subTrasSalto?.saltado === true);
ok(
  "NO toca el dominio: 0 intentos y no cubierto",
  subTrasSalto?.intentos === 0 && subTrasSalto?.cubierto === false,
  `intentos=${subTrasSalto?.intentos} cubierto=${subTrasSalto?.cubierto}`
);

const desmarca = await llamar("POST", "/api/aprender/saltar", { subtemaId: ids[0], saltado: false });
ok("se puede des-saltar", desmarca.data.saltado === false);
const invalido = await llamar("POST", "/api/aprender/saltar", { subtemaId: 0 });
ok("un subtemaId inválido da 400", invalido.status === 400, invalido.data.error);

console.log("\n5. Limpieza");
await llamar("POST", "/api/sesiones/eliminar", { sesionId: SESION });
const borrada = await llamar("GET", `/api/sesiones/${SESION}`);
ok("la sesión se eliminó", borrada.status === 404 || borrada.data.sesion === null);

console.log(fallos === 0 ? "\nOK: todos los asserts pasaron." : `\nFALLARON ${fallos} asserts.`);
process.exit(fallos === 0 ? 0 : 1);

const norm = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const tk = (t) => norm(t).split(" ").filter((w) => w.length > 1 && !VACIAS.has(w));
const sim = (a, b) => {
  const A = [...new Set(tk(a))], B = [...new Set(tk(b))];
  if (!A.length || !B.length) return 0;
  const c = A.filter((w) => B.includes(w)).length;
  return c / (A.length + B.length - c);
};
const ej1 = (bloque.data.ejercicios ?? []).map((e) => e.enunciado);
const ej2 = (bloque2.data.ejercicios ?? []).map((e) => e.enunciado);
const repetidos = [];
for (const a of ej1) for (const b of ej2) if (sim(a, b) >= 0.6) repetidos.push(`${a.slice(0, 40)} ~ ${b.slice(0, 40)} (${sim(a, b).toFixed(2)})`);
ok("ningún ejercicio del sub-tema 2 se parece a los del 1", repetidos.length === 0, repetidos.join(" | ") || "sin coincidencias");

