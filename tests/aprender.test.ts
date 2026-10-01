// Tests del parser de ejercicios: es la capa que decide qué material llega al usuario, y la que
// tenía el bug de repetición (el modelo nunca veía lo ya generado, `route.ts:95` pasaba `[]`).
import { describe, it, expect } from "vitest";

const LOTE = [
  {
    tipo: "codigo",
    lenguaje: "js",
    variante: "js",
    enunciado: "Implementa una funcion que sume dos numeros y devuelva el resultado",
    plantilla: "function sumar(a, b) { return 0; }",
    assertions: [{ descripcion: "suma", test: "sumar(2,3) === 5" }],
    solucion: "function sumar(a, b) { return a + b; }",
    pista: "Usá el operador +",
    dificultad: "facil",
  },
  {
    tipo: "codigo",
    lenguaje: "jsx",
    variante: "jsx",
    enunciado: "Implementa una funcion que sume dos numeros y devuelva el resultado",
    plantilla: "function Suma({a, b}) { return null; }",
    assertions: [{ descripcion: "render", test: "Suma({a:1,b:2}) !== null" }],
    solucion: "function Suma({a, b}) { return { tag: 'span', props: { children: a + b }, children: [] }; }",
    pista: "Devolve un objeto con tag y children",
    dificultad: "facil",
  },
  {
    tipo: "quiz",
    lenguaje: "ninguno",
    variante: "ninguno",
    enunciado: "Cual es la salida de sumar dos numeros en JavaScript",
    opciones: ["Un numero", "Una cadena", "undefined", "NaN"],
    indiceCorrecta: 0,
    solucion: "Devuelve un numero",
    pista: "",
    dificultad: "facil",
  },
];

async function parsear(raw: unknown, previos: string[] = []) {
  const { parsearLoteDeEjercicios } = await import("@/lib/aprender");
  return parsearLoteDeEjercicios(JSON.stringify(raw), previos);
}

describe("parsearLoteDeEjercicios", () => {
  it("acepta el par js/jsx con el mismo enunciado", async () => {
    // El par comparte enunciado a propósito: el dedup por clave tipo|variante|enunciado lo preserva.
    const res = (await parsear(LOTE)) as { variante: string | null; tipo: string }[];
    // El quiz normaliza su variante a null (no tiene variantes), de ahí el `null` del final.
    expect(res.map((e) => e.variante)).toEqual(["js", "jsx", null]);
    expect(res.map((e) => e.tipo)).toEqual(["codigo", "codigo", "quiz"]);
  });

  it("descarta contra los previos de la sesión", async () => {
    // El caso medido: "Crea una función llamada 'configurarUsuario'..." ya existía en la sesión 58
    // y volvió en la 63. Con los previos bien pasada, no vuelve.
    const res = (await parsear(LOTE, [LOTE[0].enunciado])) as { variante: string }[];
    expect(res.map((e) => e.variante)).not.toContain("js");
    // Y el resto del lote sigue entrando: el filtro es por enunciado, no "descarta todo".
    expect(res.length).toBeGreaterThan(0);
  });

  it("descarta reformulaciones, no solo igualdades exactas", async () => {
    const previos = ["Implementa una funcion que sume dos numeros y devuelva el resultado final"];
    const res = (await parsear(LOTE, previos)) as unknown[];
    expect(res.length).toBeLessThan(3);
  });

  it("sin previos no descarta nada del lote", async () => {
    expect((await parsear(LOTE)) as unknown[]).toHaveLength(3);
  });

  it("tira si el modelo no devuelve un array", async () => {
    await expect(parsear({ no: "es array" })).rejects.toThrow(/array/);
  });
});
