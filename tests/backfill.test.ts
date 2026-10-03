// Backfill de la memoria: el historial anterior a la columna `subtemas.concepto_id` quedaba
// afuera de los conceptos (108 sub-temas reales y 0 conceptos = la memoria parecía vacía).
// Este test siembra sub-temas "legacy" a mano y verifica que el backfill los herede.
import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DB_TEMP = path.join(os.tmpdir(), `uselearn-backfill-${process.pid}.db`);
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

/** Sub-tema como existía antes de la memoria: sin `concepto_id` (queda NULL). */
function subtemaLegacy(sesionId: number, nombre: string): number {
  const result = db.default
    .prepare("INSERT INTO subtemas (sesion_id, nombre) VALUES (?, ?)")
    .run(sesionId, nombre);
  return Number(result.lastInsertRowid);
}

function conceptoDe(subtemaId: number): number | null {
  const fila = db.default
    .prepare("SELECT concepto_id FROM subtemas WHERE id = ?")
    .get(subtemaId) as { concepto_id: number | null };
  return fila.concepto_id;
}

afterAll(() => {
  db.default.close();
  for (const sufijo of ["", "-wal", "-shm"]) fs.rmSync(DB_TEMP + sufijo, { force: true });
});

describe("backfill de conceptos (historial previo a la memoria)", () => {
  it("linkea sub-temas legacy y reconstruye contadores desde el historial real", () => {
    const s1 = db.crearSesion("legacy uno", "texto largo", "gemma3:4b");
    const s2 = db.crearSesion("legacy dos", "texto largo", "gemma3:4b");
    const sub1 = subtemaLegacy(s1, "Closures");
    const sub2 = subtemaLegacy(s2, "Closures");

    // El sondeo de esa época dejó respuestas en `subtemas.total_*`, pero no había concepto
    // al cual sumarlas: era justo lo que había que reconstruir.
    db.registrarRespuesta(preguntaEn(s1, sub1, "uno"), "uno"); // acierto
    db.registrarRespuesta(preguntaEn(s1, sub1, "dos"), "distractor uno"); // fallo

    expect(conceptoDe(sub1)).toBeNull();
    expect(conceptoDe(sub2)).toBeNull();
    expect(db.contarConceptos().total).toBe(0);

    expect(db.backfillConceptos()).toBe(2);

    // Las dos apariciones del mismo nombre apuntan a UN concepto.
    expect(conceptoDe(sub1)).not.toBeNull();
    expect(conceptoDe(sub1)).toBe(conceptoDe(sub2));

    const concepto = db.obtenerConcepto(conceptoDe(sub1) as number);
    expect(concepto?.vecesVisto).toBe(2);
    expect(concepto?.vecesAcierto).toBe(1);
    expect(concepto?.vecesFallo).toBe(1);
    // Repaso programado = aparece como vencido hoy (historial viejo, hay que preguntarle).
    expect(concepto?.proximoRepaso).not.toBeNull();
    expect(db.obtenerConceptosVencidos().some((c) => c.id === concepto?.id)).toBe(true);
  });

  it("una segunda corrida no hace nada (idempotente)", () => {
    const antes = db.contarConceptos();
    expect(db.backfillConceptos()).toBe(0);
    expect(db.contarConceptos()).toEqual(antes);

    const conceptos = db.listarConceptos();
    const closures = conceptos.find((c) => c.nombre === "Closures");
    expect(closures?.vecesVisto).toBe(2);
    expect(closures?.vecesAcierto).toBe(1);
    expect(closures?.vecesFallo).toBe(1);
  });

  it("un concepto creado hoy queda agendado (+1 día), no vencido al instante", () => {
    const s = db.crearSesion("hoy", "texto", "gemma3:4b");
    const sub = db.agregarSubtema(s, "useState");
    const concepto = db.obtenerConcepto(conceptoDe(sub) as number);

    expect(concepto?.proximoRepaso).not.toBeNull();
    // Caja 1 = repaso a 1 día: recién pasado mañana aparece como vencido.
    expect(db.obtenerConceptosVencidos().some((c) => c.id === concepto?.id)).toBe(false);
  });
});
