// Tests de las reglas de dominio: son las que deciden si un sub-tema queda "cubierto", y un
// error acá no rompe la pantalla: cambia en silencio cuántos conceptos se marcan dominados.
// Corren contra una base temporal propia (USELEARN_DB), así que la real no se toca.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// `lib/db.ts` abre la base al importarse, así que la variable tiene que estar puesta ANTES del
// import (los imports se suben, por eso se usa import dinámico arriba del nivel de módulo).
const DB_TEMP = path.join(os.tmpdir(), `uselearn-test-${process.pid}.db`);
for (const sufijo of ["", "-wal", "-shm"]) fs.rmSync(DB_TEMP + sufijo, { force: true });
process.env.USELEARN_DB = DB_TEMP;

const db = await import("@/lib/db");

let SESION = 0;
let SUBTEMA = 0;

/** Guarda una pregunta de opción múltiple: la correcta va siempre en el índice 0. */
function preguntaEn(sesionId: number, subtemaId: number, correcta: string): number {
  const opciones = [correcta, "distractor uno", "distractor dos", "distractor tres"];
  const [id] = db.guardarLotePreguntas(
    sesionId,
    subtemaId,
    "sondeo",
    [JSON.stringify({ pregunta: `pregunta sobre ${correcta}`, opciones, indiceCorrecta: 0, explicacion: "porque sí" })]
  );
  return id;
}

/** Atajo para la sesión que arma el `beforeEach`. */
function pregunta(subtemaId: number, correcta: string): number {
  return preguntaEn(SESION, subtemaId, correcta);
}

/**
 * Guarda un EJERCICIO (no una pregunta de sondeo): la anti-repetición de Enseñar trabaja sobre
 * `ejercicios`, que es otra tabla. `guardarEjercicios` es la misma función que usa el server.
 */
function ejercicioEn(sesionId: number, subtemaId: number, enunciado: string): number {
  const [id] = db.guardarEjercicios(sesionId, [
    {
      subtemaId,
      orden: 0,
      tipo: "codigo",
      lenguaje: "js",
      variante: "js",
      enunciado,
      plantilla: "function resolver() {}",
      assertions: [{ descripcion: "define resolver", test: "typeof resolver === 'function'" }],
      opciones: null,
      indiceCorrecta: null,
      pista: null,
      solucion: null,
      dificultad: "media",
    },
  ]);
  return id;
}

beforeEach(() => {
  SESION = db.crearSesion("test", "texto de prueba", "gemma3:4b");
  SUBTEMA = db.agregarSubtema(SESION, "Closures");
});

afterAll(() => {
  // La base tiene que cerrarse antes de borrar el archivo: con la conexión abierta Windows
  // tira EPERM y la base temporal queda en el disco.
  db.default.close();
  for (const sufijo of ["", "-wal", "-shm"]) fs.rmSync(DB_TEMP + sufijo, { force: true });
});

describe("registrarRespuesta", () => {
  it("guarda la opción que eligió el usuario", () => {
    const id = pregunta(SUBTEMA, "correcta");
    db.registrarRespuesta(id, "distractor uno");
    const [historial] = db.obtenerHistorialSesion(SESION);
    expect(historial.opcionElegida).toBe("distractor uno");
    expect(historial.correcta).toBe(false);
  });

  it("acierta con independencia de mayúsculas y espacios", () => {
    expect(db.registrarRespuesta(pregunta(SUBTEMA, "Correcta"), "  correcta ").correcta).toBe(true);
  });

  it("acumula intentos y contadores reales", () => {
    db.registrarRespuesta(pregunta(SUBTEMA, "uno"), "uno");
    db.registrarRespuesta(pregunta(SUBTEMA, "dos"), "distractor uno");
    const [sub] = db.obtenerSubtemas(SESION);
    expect(sub.intentos).toBe(2);
    expect(sub.correctas).toBe(1);
    expect(sub.incorrectas).toBe(1);
  });

  it("un error resetea los aciertos seguidos", () => {
    db.registrarRespuesta(pregunta(SUBTEMA, "uno"), "uno");
    db.registrarRespuesta(pregunta(SUBTEMA, "dos"), "distractor uno");
    expect(db.obtenerSubtemas(SESION)[0]?.aciertosSeguidos).toBe(0);
  });

  it("domina con 2 aciertos seguidos", () => {
    let ultimo: { dominado?: boolean } = {};
    for (const correcta of ["uno", "dos", "tres"]) {
      ultimo = db.registrarRespuesta(pregunta(SUBTEMA, correcta), correcta);
    }
    expect(ultimo.dominado).toBe(true);
    expect(db.obtenerSubtemas(SESION)[0]?.cubierto).toBe(true);
  });

  it("es idempotente: responder dos veces no cuenta el intento dos veces", () => {
    const id = pregunta(SUBTEMA, "uno");
    db.registrarRespuesta(id, "uno");
    expect(db.registrarRespuesta(id, "uno").yaRespondida).toBe(true);
    expect(db.obtenerSubtemas(SESION)[0]?.intentos).toBe(1);
  });

  it("al dominar, descarta las preguntas que sobran del lote", () => {
    // El lote se genera ENTERO antes de responder (como hace el servidor), así que al dominar
    // hay preguntas sin usar que hay que dejar de contar.
    const lote = ["uno", "dos", "tres", "cuatro"].map((c) => pregunta(SUBTEMA, c));
    db.registrarRespuesta(lote[0], "uno");
    db.registrarRespuesta(lote[1], "dos");

    const progreso = db.contarProgresoSesion(SESION);
    expect(progreso.respondidas).toBe(2);
    expect(progreso.totalServibles).toBe(2); // las 2 sobrantes quedaron descartadas
  });

  it("responder una pregunta descartada NO toca el desempeño del sub-tema", () => {
    // Guard de §3.2: el cliente puede tener en caché una pregunta de un lote que el servidor ya
    // descartó, y contestarla no puede "des-dominar" el sub-tema ni sumar intentos.
    const lote = ["uno", "dos"].map((c) => pregunta(SUBTEMA, c));
    db.registrarRespuesta(lote[0], "uno");
    db.registrarRespuesta(lote[1], "dos");

    // Una 4ta pregunta del mismo lote, ya descartada por el dominio.
    const [sobro] = db.guardarLotePreguntas(SESION, SUBTEMA, "sondeo", [
      JSON.stringify({
        pregunta: "pregunta abandonada",
        opciones: ["correcta", "d1", "d2", "d3"],
        indiceCorrecta: 0,
        explicacion: "porque sí",
      }),
    ]);
    db.default.prepare("UPDATE preguntas SET descartada = 1 WHERE id = ?").run(sobro);

    expect(db.registrarRespuesta(sobro, "d1").descartada).toBe(true);

    const [sub] = db.obtenerSubtemas(SESION);
    expect(sub.cubierto).toBe(true);
    expect(sub.aciertosSeguidos).toBe(2);
    expect(sub.intentos).toBe(2); // la abandonada NO sumó intento
  });

  it("tira si la pregunta no existe", () => {
    expect(() => db.registrarRespuesta(999999, "x")).toThrow(/no existe/);
  });
});

describe("obtenerEnunciadosEjercicios (anti-repetición)", () => {
  // Es la entrada que evita que un sub-tema repita lo que ya se practicó en otro. El caso medido:
  // las sesiones 58 y 63 generaron ambas "Crea una función llamada 'configurarUsuario'...".
  it("devuelve vacío cuando la sesión no tiene ejercicios", () => {
    expect(db.obtenerEnunciadosEjercicios(SESION)).toEqual([]);
  });

  it("devuelve los enunciados de todos los sub-temas de la sesión", () => {
    const otro = db.agregarSubtema(SESION, "Otro");
    ejercicioEn(SESION, SUBTEMA, "ejercicio del primero");
    ejercicioEn(SESION, otro, "ejercicio del segundo");

    const enunciados = db.obtenerEnunciadosEjercicios(SESION);
    expect(enunciados).toHaveLength(2);
    expect(enunciados.some((e) => e.includes("primero"))).toBe(true);
    expect(enunciados.some((e) => e.includes("segundo"))).toBe(true);
  });

  it("excluye los ejercicios del sub-tema indicado", () => {
    // Importa: las variantes js y jsx del propio sub-tema comparten enunciado a propósito, y si
    // entraran en la lista el parser se comería la segunda variante del par.
    const otro = db.agregarSubtema(SESION, "Otro");
    ejercicioEn(SESION, SUBTEMA, "ejercicio propio");
    ejercicioEn(SESION, otro, "ejercicio ajeno");

    const enunciados = db.obtenerEnunciadosEjercicios(SESION, SUBTEMA);
    expect(enunciados).toHaveLength(1);
    expect(enunciados[0]).toContain("ajeno");
  });

  it("no ve ejercicios de otra sesión", () => {
    const otraSesion = db.crearSesion("otra", "texto", "gemma3:4b");
    const subOtro = db.agregarSubtema(otraSesion, "Ajeno");
    ejercicioEn(otraSesion, subOtro, "ejercicio de otra sesion");
    ejercicioEn(SESION, SUBTEMA, "ejercicio de esta");

    const enunciados = db.obtenerEnunciadosEjercicios(SESION);
    expect(enunciados).toHaveLength(1);
    expect(enunciados[0]).toContain("esta");
  });
});

describe("marcarSubtemaSaltado", () => {
  it("empieza en false y se puede alternar", () => {
    expect(db.obtenerSubtemas(SESION)[0]?.saltado).toBe(false);

    expect(db.marcarSubtemaSaltado(SUBTEMA, true).saltado).toBe(true);
    expect(db.obtenerSubtemas(SESION)[0]?.saltado).toBe(true);

    expect(db.marcarSubtemaSaltado(SUBTEMA, false).saltado).toBe(false);
    expect(db.obtenerSubtemas(SESION)[0]?.saltado).toBe(false);
  });

  it("NO toca el dominio: saltar no es aprobar ni reprobar", () => {
    // El punto de la decisión: si saltar modificara el desempeño, el usuario podría "apostar"
    // saltando los que le salen mal.
    db.registrarRespuesta(pregunta(SUBTEMA, "uno"), "uno");
    const antes = db.obtenerSubtemas(SESION)[0];

    db.marcarSubtemaSaltado(SUBTEMA, true);
    const despues = db.obtenerSubtemas(SESION)[0];

    expect(despues.intentos).toBe(antes.intentos);
    expect(despues.correctas).toBe(antes.correctas);
    expect(despues.cubierto).toBe(antes.cubierto);
    expect(despues.aciertosSeguidos).toBe(antes.aciertosSeguidos);
    expect(despues.saltado).toBe(true);
  });

  it("tira si el sub-tema no existe", () => {
    expect(() => db.marcarSubtemaSaltado(999999, true)).toThrow(/no existe/);
  });
});

describe("reportarEjercicioMalo (ítem 15, fase Enseñar)", () => {
  it("guarda el reporte con el motivo y una copia completa del ejercicio", () => {
    const id = ejercicioEn(SESION, SUBTEMA, "ejercicio para reportar");
    expect(db.reportarEjercicioMalo(id, "no_se_entiende").ok).toBe(true);

    const [reporte] = db.obtenerReportesEjercicio(SESION);
    expect(reporte.motivo).toBe("no_se_entiende");
    expect(reporte.ejercicioId).toBe(id);
    // El contenido tiene que venir con assertions parseadas, no como string: sin eso el
    // reporte no sirve para depurar por qué el ejercicio "no funciona".
    const contenido = JSON.parse(reporte.contenido);
    expect(typeof contenido.enunciado).toBe("string");
    expect(Array.isArray(contenido.assertions)).toBe(true);
  });

  it("NO descarta ni borra el ejercicio: se puede volver a abrir para reproducirlo", () => {
    // Decisión clave y contraintuitiva: en el sondeo la pregunta mala sí se descarta, pero acá no.
    // El material de Enseñar está cacheado por sub-tema: sacarlo a mitad de sesión le quitaría
    // al usuario la práctica, y un reporte de "la solución no funciona" solo sirve si después
    // se puede volver a abrir el ejercicio.
    const id = ejercicioEn(SESION, SUBTEMA, "ejercicio con la solución rota");
    db.reportarEjercicioMalo(id, "la_solucion_no_funciona");
    expect(db.obtenerEjercicios(SESION, SUBTEMA).some((e) => e.id === id)).toBe(true);
  });

  it("NO registra un intento ni toca el conteo de aprobados", () => {
    const id = ejercicioEn(SESION, SUBTEMA, "ejercicio sin intentar");
    const antes = db.contarAprendizaje(SESION).find((c) => c.subtemaId === SUBTEMA);
    db.reportarEjercicioMalo(id, "muy_dificil");
    const despues = db.contarAprendizaje(SESION).find((c) => c.subtemaId === SUBTEMA);
    expect(despues?.ejerciciosAprobados).toBe(antes?.ejerciciosAprobados);
    expect(db.obtenerIntentosEjercicio(id)).toHaveLength(0);
  });

  it("es idempotente: reportar dos veces no duplica", () => {
    const id = ejercicioEn(SESION, SUBTEMA, "ejercicio reportado dos veces");
    db.reportarEjercicioMalo(id, "otra");
    const segundo = db.reportarEjercicioMalo(id, "no_se_entiende");
    expect(segundo.yaReportado).toBe(true);
    expect(db.obtenerReportesEjercicio(SESION)).toHaveLength(1);
    // El primer motivo es el que vale: es el que el usuario eligió antes de ver el resultado.
    expect(db.obtenerReportesEjercicio(SESION)[0].motivo).toBe("otra");
  });

  it("rechaza un motivo fuera de la lista cerrada", () => {
    const id = ejercicioEn(SESION, SUBTEMA, "ejercicio con motivo inválido");
    expect(() => db.reportarEjercicioMalo(id, "porque sí")).toThrow(/Motivo inválido/);
    expect(db.obtenerReportesEjercicio(SESION)).toEqual([]);
  });

  it("acepta todos los motivos de la lista", () => {
    for (const motivo of db.MOTIVOS_EJERCICIO_MALA) {
      const id = ejercicioEn(SESION, SUBTEMA, `ejercicio motivo ${motivo}`);
      expect(db.reportarEjercicioMalo(id, motivo).ok).toBe(true);
    }
    expect(db.obtenerReportesEjercicio(SESION)).toHaveLength(db.MOTIVOS_EJERCICIO_MALA.length);
  });

  it("tira si el ejercicio no existe", () => {
    expect(() => db.reportarEjercicioMalo(999999, "otra")).toThrow(/no existe/);
  });

  it("eliminar la sesión borra también los reportes de ejercicios (orden de FKs)", () => {
    const id = db.crearSesion("para borrar ejercicios", "texto", "gemma3:4b");
    const sub = db.agregarSubtema(id, "Sub");
    db.reportarEjercicioMalo(ejercicioEn(id, sub, "uno"), "otra");
    expect(db.obtenerReportesEjercicio(id)).toHaveLength(1);

    db.eliminarSesion(id);
    expect(db.obtenerReportesEjercicio(id)).toEqual([]);
  });

  it("los reportes de ejercicio NO se mezclan con los de pregunta", () => {
    // Son tablas distintas a propósito: el juez semántico de §14 evalúa preguntas del sondeo, no
    // ejercicios de código. Si compartieran tabla, la calibración mezclaría dos cosas distintas.
    const idEjercicio = ejercicioEn(SESION, SUBTEMA, "para el contraste");
    const idPregunta = pregunta(SUBTEMA, "uno");
    db.reportarEjercicioMalo(idEjercicio, "otra");
    db.reportarPreguntaMala(idPregunta, "otra");

    expect(db.obtenerReportesEjercicio(SESION)).toHaveLength(1);
    expect(db.obtenerReportes(SESION)).toHaveLength(1);
    expect(db.obtenerReportes(SESION)[0].preguntaId).toBe(idPregunta);
    expect(db.obtenerReportesEjercicio(SESION)[0].ejercicioId).toBe(idEjercicio);
  });
});

describe("reportarPreguntaMala (ítem 15)", () => {
  // El server la llama `reportarPreguntaMala`, y estos tests usan el mismo nombre para que un
  // grep por uno encuentre el otro.
  const reportar = (id: number, motivo: string) => db.reportarPreguntaMala(id, motivo);

  it("guarda el reporte con el motivo y una copia del contenido", () => {
    const id = pregunta(SUBTEMA, "uno");
    const resultado = reportar(id, "respuesta_mal_marcada");

    expect(resultado.ok).toBe(true);
    expect(resultado.yaReportada).toBe(false);
    const [reporte] = db.obtenerReportes(SESION);
    expect(reporte.motivo).toBe("respuesta_mal_marcada");
    // La copia del contenido es lo que alimenta el set golden: sin ella, el reporte no sirve.
    expect(JSON.parse(reporte.contenido).pregunta).toContain("uno");
  });

  it("descarta la pregunta para que no vuelva a servirse", () => {
    const id = pregunta(SUBTEMA, "uno");
    expect(db.contarProgresoSesion(SESION).totalServibles).toBe(1);
    reportar(id, "otra");
    expect(db.contarProgresoSesion(SESION).totalServibles).toBe(0);
  });

  it("NO toca el desempeño del sub-tema ni suma intentos", () => {
    // Lo importante: una pregunta mala no es un error del usuario. Si contara, marcar una
    // pregunta podría "des-dominar" el sub-tema.
    const id = pregunta(SUBTEMA, "uno");
    reportar(id, "respuesta_mal_marcada");

    const [sub] = db.obtenerSubtemas(SESION);
    expect(sub.intentos).toBe(0);
    expect(sub.correctas).toBe(0);
    expect(sub.incorrectas).toBe(0);
    expect(sub.cubierto).toBe(false);
  });

  it("no la registra como respuesta", () => {
    const id = pregunta(SUBTEMA, "uno");
    reportar(id, "otra");
    expect(db.obtenerHistorialSesion(SESION)).toEqual([]);
  });

  it("es idempotente: reportar dos veces no duplica el reporte", () => {
    const id = pregunta(SUBTEMA, "uno");
    reportar(id, "otra");
    const segundo = reportar(id, "enunciado_ambiguo");

    expect(segundo.yaReportada).toBe(true);
    expect(db.obtenerReportes(SESION)).toHaveLength(1);
    // El motivo original no se pisa: el primer reporte es el que vale.
    expect(db.obtenerReportes(SESION)[0].motivo).toBe("otra");
  });

  it("rechaza un motivo fuera de la lista cerrada", () => {
    const id = pregunta(SUBTEMA, "uno");
    expect(() => reportar(id, "porque sí")).toThrow(/Motivo inválido/);
    // Y no reporta nada: un motivo desconocido no puede guardarse como `otra` en silencio.
    expect(db.obtenerReportes(SESION)).toEqual([]);
  });

  it("acepta todos los motivos de la lista", () => {
    for (const motivo of db.MOTIVOS_PREGUNTA_MALA) {
      const id = preguntaEn(SESION, SUBTEMA, `motivo-${motivo}`);
      expect(reportar(id, motivo).ok).toBe(true);
    }
    expect(db.obtenerReportes(SESION)).toHaveLength(db.MOTIVOS_PREGUNTA_MALA.length);
  });

  it("tira si la pregunta no existe", () => {
    expect(() => reportar(999999, "otra")).toThrow(/no existe/);
  });

  it("eliminar la sesión borra también los reportes (orden de FKs)", () => {
    const id = db.crearSesion("para borrar reportes", "texto", "gemma3:4b");
    const sub = db.agregarSubtema(id, "Sub");
    const p = preguntaEn(id, sub, "uno");
    db.reportarPreguntaMala(p, "otra");
    expect(db.obtenerReportes(id)).toHaveLength(1);

    db.eliminarSesion(id);
    expect(db.obtenerReportes(id)).toEqual([]);
  });
});

describe("elegirSiguienteSubtema", () => {
  // Estos tests usan sesiones propias: el `beforeEach` crea un sub-tema que acá estorbaría.
  function sesionLimpia(): number {
    return db.crearSesion("para elegir", "texto", "gemma3:4b");
  }

  it("elige el menos avanzado de los que no están cubiertos", () => {
    const sesion = sesionLimpia();
    const a = db.agregarSubtema(sesion, "A");
    const b = db.agregarSubtema(sesion, "B");
    db.registrarRespuesta(preguntaEn(sesion, a, "uno"), "uno"); // A lleva 1 acierto

    const siguiente = db.elegirSiguienteSubtema(db.obtenerSubtemas(sesion));
    // B está más atrás (0 aciertos), así que va primero: la función sirve el menos avanzado.
    expect(siguiente?.id).toBe(b);
  });

  it("devuelve null cuando no queda nada por cubrir", () => {
    const sesion = sesionLimpia();
    const a = db.agregarSubtema(sesion, "A");
    for (const correcta of ["uno", "dos"]) {
      db.registrarRespuesta(preguntaEn(sesion, a, correcta), correcta);
    }
    expect(db.elegirSiguienteSubtema(db.obtenerSubtemas(sesion))).toBeNull();
  });
});

describe("sondeoCompleto", () => {
  it("es cierto solo cuando todos los sub-temas están cubiertos", () => {
    const sesion = db.crearSesion("para completo", "texto", "gemma3:4b");
    const a = db.agregarSubtema(sesion, "A");
    db.agregarSubtema(sesion, "B");
    expect(db.sondeoCompleto(db.obtenerSubtemas(sesion))).toBe(false);
    for (const correcta of ["uno", "dos"]) {
      db.registrarRespuesta(preguntaEn(sesion, a, correcta), correcta);
    }
    expect(db.sondeoCompleto(db.obtenerSubtemas(sesion))).toBe(false);
  });
});

describe("eliminarSesion", () => {
  it("borra en el orden correcto de las foreign keys y no deja huérfanos", () => {
    const id = db.crearSesion("para borrar", "texto", "gemma3:4b");
    const sub = db.agregarSubtema(id, "Sub");
    db.registrarRespuesta(preguntaEn(id, sub, "uno"), "uno");
    db.guardarExplicaciones(id, [
      { subtemaId: sub, orden: 0, tipo: "que_es", titulo: "T", contenido: "C" },
    ]);

    db.eliminarSesion(id);
    expect(db.obtenerSesion(id)).toBeNull();
    expect(db.obtenerSubtemas(id)).toEqual([]);
    expect(db.obtenerExplicaciones(id, sub)).toEqual([]);
  });
});
