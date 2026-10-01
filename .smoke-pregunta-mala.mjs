// Humo del ítem 15 ("esta pregunta está mal"): reportar por HTTP contra un dev server, no contra la
// capa de datos. Los tests de `db.test.ts` ya cubren la persistencia; lo que falta verificar acá
// es el contrato del endpoint y que reportar NO toca el desempeño del sub-tema.
//
// Uso:  node .smoke-pregunta-mala.mjs <baseUrl>   (con USELEARN_DB apuntando a una base temporal)
const BASE = process.argv[2] ?? "http://localhost:3112";
const MODELO = process.argv[3] ?? "gemma3:4b";

let fallos = 0;
function ok(nombre, cond, detalle = "") {
  const sufijo = detalle ? `  (${detalle})` : "";
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${nombre}${sufijo}`);
  if (!cond) fallos += 1;
}

async function llamar(metodo, ruta, body) {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const APUNTE = [
  "Los closures en JavaScript son funciones que conservan el ámbito donde fueron creadas,",
  "incluso después de que ese ámbito terminó de ejecutarse.",
  "",
  "Ejemplo clásico: al declarar un bucle con for (var i = 0; ...), todas las funciones devueltas",
  "comparten la misma referencia a i. Con let en cambio cada iteración crea un ámbito nuevo.",
  "",
  "Otros conceptos: el cierre léxico (lexical scope), el ámbito de bloque y la diferencia entre",
  "var, let y const dentro de funciones anidadas.",
].join("\n");

console.log(`1. Crear la sesión (${MODELO})`);
const creada = await llamar("POST", "/api/sesiones/crear", {
  texto: APUNTE,
  modeloPrincipal: MODELO,
  modeloPreguntas: MODELO,
  preset: "rapido",
});
if (creada.status !== 200 || !creada.data.sesionId) {
  console.log(`  FAIL  no se pudo crear la sesión: ${JSON.stringify(creada.data).slice(0, 300)}`);
  process.exit(1);
}
const SESION = creada.data.sesionId;
const subtemas = creada.data.subtemas ?? [];
ok("la sesión se creó con sub-temas", subtemas.length > 0, `${subtemas.length} sub-temas`);

console.log("\n2. Pedir la primera pregunta");
const primera = await llamar(
  "GET",
  `/api/sondeo/siguiente-pregunta?sesionId=${SESION}&modeloPreguntas=${encodeURIComponent(MODELO)}&modeloPrincipal=${encodeURIComponent(MODELO)}&preset=rapido`
);
ok("llegó una pregunta", Boolean(primera.data.preguntaId), `id=${primera.data.preguntaId}`);
if (!primera.data.preguntaId) process.exit(1);
const PREGUNTA = primera.data.preguntaId;
const SUBTEMA = primera.data.subtemaId;

const estadoAntes = await llamar("GET", `/api/sesiones/${SESION}`);
const totalAntes = estadoAntes.data.progreso?.totalServibles;
const respuestaAntes = estadoAntes.data.historial?.length ?? 0;
ok("el total servible cuenta la pregunta", typeof totalAntes === "number", `total=${totalAntes}`);

console.log("\n3. Reportar la pregunta como mala");
const reporte = await llamar("POST", "/api/sondeo/pregunta-mala", {
  preguntaId: PREGUNTA,
  motivo: "respuesta_mal_marcada",
  sesionId: SESION,
  modeloPreguntas: MODELO,
  modeloPrincipal: MODELO,
  preset: "rapido",
});
ok("el reporte devuelve ok", reporte.data.ok === true, JSON.stringify(reporte.data).slice(0, 160));
ok("no viene yaReportada la primera vez", reporte.data.yaReportada === false);
ok(
  "devuelve la siguiente en la misma respuesta",
  Boolean(reporte.data.siguiente),
  reporte.data.siguienteError
    ? `siguienteError: ${reporte.data.siguienteError}`
    : reporte.data.siguiente
      ? `pregunta ${reporte.data.siguiente.preguntaId}`
      : "sin siguiente"
);

console.log("\n4. Verificar que la pregunta se descartó");
const estadoDespues = await llamar("GET", `/api/sesiones/${SESION}`);
const totalDespues = estadoDespues.data.progreso?.totalServibles;
ok("el total servible bajó", totalDespues === totalAntes - 1, `${totalAntes} → ${totalDespues}`);
ok(
  "NO se registró como respuesta (no cuenta como intento del usuario)",
  (estadoDespues.data.historial?.length ?? 0) === respuestaAntes,
  `historial ${respuestaAntes} → ${estadoDespues.data.historial?.length ?? 0}`
);

const sub = estadoDespues.data.subtemas?.find((s) => s.id === SUBTEMA);
ok("el sub-tema NO se descontaminó (0 intentos, no cubierto)", sub?.intentos === 0 && sub?.cubierto === false, `intentos=${sub?.intentos} cubierto=${sub?.cubierto}`);

console.log("\n5. Idempotencia y validación");
const repetido = await llamar("POST", "/api/sondeo/pregunta-mala", { preguntaId: PREGUNTA, motivo: "otra" });
ok("reportar dos veces no rompe", repetido.status === 200 && repetido.data.yaReportada === true);

const motivoMalo = await llamar("POST", "/api/sondeo/pregunta-mala", { preguntaId: PREGUNTA, motivo: "porque sí" });
ok("un motivo desconocido da 400", motivoMalo.status === 400, motivoMalo.data.error);

const inexistente = await llamar("POST", "/api/sondeo/pregunta-mala", { preguntaId: 999999, motivo: "otra" });
ok("una pregunta inexistente da 500 con mensaje", inexistente.status === 500, inexistente.data.error);

console.log("\n6. Limpieza");
await llamar("POST", "/api/sesiones/eliminar", { sesionId: SESION });
const borrada = await llamar("GET", `/api/sesiones/${SESION}`);
ok("la sesión se eliminó", borrada.status === 404 || borrada.data.sesion === null);

console.log(fallos === 0 ? "\nOK: todos los asserts pasaron." : `\nFALLARON ${fallos} asserts.`);
process.exit(fallos === 0 ? 0 : 1);
