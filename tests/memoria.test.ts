// Memoria entre sesiones: los `conceptos` y el repaso espaciado (sección 11 del ESTADO).
// Es la pieza que hace que "Closures" en la sesión 1 y en la 8 sean el mismo concepto y
// que la app pueda programar un repaso. Corre contra una base temporal propia.
import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DB_TEMP = path.join(os.tmpdir(), `uselearn-memoria-${process.pid}.db`);
for (const sufijo of ["", "-wal", "-shm"]) fs.rmSync(DB_TEMP + sufijo, { force: true });
process.env.USELEARN_DB = DB_TEMP;

const db = await import("@/lib/db");

/** Pregunta de opción múltiple con la correcta siempre en el índice 0. */
function preguntaEn(sesionId: number, subtemaId: number, correcta: string): number {
  const opciones = [correcta, "distractor uno", "distractor dos", "distractor tres"];
  const [id] = db.guardarLotePreguntas(sesionId, subtemaId, "sondeo", [
    JSON.stringify({
      pregunta: `pregunta sobre ${correcta}`,
      opciones,
      indiceCorrecta: 0,
      explicacion: "porque sí",
    }),
  ]);
  return id;
}

/** concepto_id de un sub-tema (la columna que enlaza con la memoria global). */
function conceptoDe(subtemaId: number): number {
  const fila = db.default
    .prepare("SELECT concepto_id FROM subtemas WHERE id = ?")
    .get(subtemaId) as { concepto_id: number };
  return fila.concepto_id;
}

afterAll(() => {
  db.default.close();
  for (const sufijo of ["", "-wal", "-shm"]) fs.rmSync(DB_TEMP + sufijo, { force: true });
});

describe("conceptos: memoria entre sesiones", () => {
  it("el mismo sub-tema en dos sesiones apunta al MISMO concepto", () => {
    const s1 = db.crearSesion("uno", "texto", "gemma3:4b");
    const s2 = db.crearSesion("dos", "texto", "gemma3:4b");
    const a = db.agregarSubtema(s1, "Closures");
    const b = db.agregarSubtema(s2, "closures"); // distinta caja/puntuación, mismo concepto

    const cA = conceptoDe(a);
    const cB = conceptoDe(b);
    expect(cA).toBe(cB);

    const concepto = db.obtenerConcepto(cA);
    expect(concepto?.vecesVisto).toBe(2);
  });

  it("dos nombres distintos crean dos conceptos distintos", () => {
    const s = db.crearSesion("tres", "texto", "gemma3:4b");
    const a = db.agregarSubtema(s, "Arrays");
    const b = db.agregarSubtema(s, "Promesas");
    expect(conceptoDe(a)).not.toBe(conceptoDe(b));
  });

  it("un acierto sube la caja y programa repaso; un fallo vuelve a la caja 1", () => {
    const s = db.crearSesion("cuatro", "texto", "gemma3:4b");
    const sub = db.agregarSubtema(s, "useState");
    const conceptoId = conceptoDe(sub);

    db.registrarRespuesta(preguntaEn(s, sub, "uno"), "uno");
    let concepto = db.obtenerConcepto(conceptoId);
    expect(concepto?.vecesAcierto).toBe(1);
    expect(concepto?.vecesFallo).toBe(0);
    expect(concepto?.caja).toBe(2);
    expect(concepto?.ultimoResultado).toBe(true);
    expect(concepto?.proximoRepaso).not.toBeNull();

    db.registrarRespuesta(preguntaEn(s, sub, "dos"), "un distractor");
    concepto = db.obtenerConcepto(conceptoId);
    expect(concepto?.vecesFallo).toBe(1);
    expect(concepto?.caja).toBe(1);
    expect(concepto?.ultimoResultado).toBe(false);
  });

  it("el próximo repaso queda en el futuro: no aparece como vencido al instante", () => {
    const s = db.crearSesion("cinco", "texto", "gemma3:4b");
    const sub = db.agregarSubtema(s, "useEffect");
    db.registrarRespuesta(preguntaEn(s, sub, "uno"), "uno");
    const vencidos = db.obtenerConceptosVencidos();
    expect(vencidos.some((c) => c.nombre === "useEffect")).toBe(false);
  });

  it("crearSesionRepaso arma una sesión de modo repaso con los sub-temas del concepto", () => {
    const s = db.crearSesion("origen", "material sobre closures y scope", "gemma3:4b");
    const sub = db.agregarSubtema(s, "Closures en JS", "fragmento de closures");
    const conceptoId = conceptoDe(sub);

    const repaso = db.crearSesionRepaso([conceptoId]);
    expect(repaso).toBeGreaterThan(0);

    const sesion = db.obtenerSesion(repaso as number);
    expect(sesion?.modo).toBe("repaso");

    const subtemas = db.obtenerSubtemas(repaso as number);
    expect(subtemas).toHaveLength(1);
    expect(subtemas[0].nombre).toBe("Closures en JS");
    // El fragmento original sobrevive: es lo que permite repasar aunque el nombre no
    // aparezca literal en el texto elegido.
    expect(subtemas[0].fragmento).toBe("fragmento de closures");
    // Se enlaza al MISMO concepto (no crea uno nuevo).
    expect(conceptoDe(subtemas[0].id)).toBe(conceptoId);
  });

  it("crearSesionRepaso devuelve null si no hay conceptos válidos", () => {
    expect(db.crearSesionRepaso([])).toBeNull();
    expect(db.crearSesionRepaso([999999])).toBeNull();
  });

  it("contarConceptos reporta el total", () => {
    const { total } = db.contarConceptos();
    expect(total).toBeGreaterThanOrEqual(4);
  });
});
