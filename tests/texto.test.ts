// Tests de la capa determinista de texto. Son las funciones que deciden qué se estudia y en qué
// orden, así que un error acá no se ve en la pantalla: se ve como "la app no saca sub-temas del
// final del apunte". No dependen de modelo ni de la base, y por eso corren en cualquier máquina.
import { describe, it, expect } from "vitest";
import {
  dividirEnBloques,
  repartirPorCuota,
  derivarTema,
  esParecido,
  normalizarParaSimilitud,
  extraerExcerpt,
  ordenarPorAparicion,
  deduplicarPorSimilitud,
} from "@/lib/texto";

describe("dividirEnBloques", () => {
  it("parte un texto largo en varios bloques", () => {
    const texto = Array.from({ length: 40 }, (_, i) => `párrafo número ${i} con contenido`).join("\n\n");
    expect(dividirEnBloques(texto, 300, 8).length).toBeGreaterThan(1);
  });

  it("respeta el tope de bloques agrandando el tamaño, para no perder el final", () => {
    const texto = "a".repeat(20000);
    const bloques = dividirEnBloques(texto, 1000, 4);
    expect(bloques.length).toBeLessThanOrEqual(4);
    // Nada del texto se pierde: concatenando los bloques vuelve a estar todo.
    expect(bloques.join("").length).toBe(20000);
  });

  it("nunca corta un párrafo por la mitad", () => {
    const parrafo = "palabra ".repeat(100).trim();
    for (const bloque of dividirEnBloques(parrafo, 200, 4)) {
      expect(bloque.startsWith("palabra")).toBe(true);
      expect(bloque.endsWith("palabra")).toBe(true);
    }
  });

  it("devuelve 0 bloques para texto vacío", () => {
    expect(dividirEnBloques("   \n  ", 3500, 8)).toEqual([]);
  });

  it("un solo bloque cuando el texto entra entero", () => {
    expect(dividirEnBloques("texto corto", 3500, 8)).toEqual(["texto corto"]);
  });
});

describe("repartirPorCuota", () => {
  // Caso real medido el 30/09: 4 bloques, 17 candidatos, tope 10. Con el corte por orden global
  // se perdían los 2 del último bloque, o sea el final del apunte.
  const MEDIDO = [
    ["a1", "a2", "a3", "a4", "a5"],
    ["b1", "b2", "b3", "b4", "b5"],
    ["c1", "c2", "c3", "c4", "c5"],
    ["d1", "d2"],
  ];
  const candidatos = () => MEDIDO.flatMap((nombres, bloque) => nombres.map((nombre) => ({ nombre, bloque })));

  it("el último bloque sobrevive al corte (el bug que corregía)", () => {
    const elegidos = repartirPorCuota(candidatos(), (c) => c.bloque, 10);
    // Antes del fix: 0 de 2. Ahora el final del documento entra por construcción.
    expect(elegidos.filter((c) => c.bloque === 3).length).toBeGreaterThan(0);
  });

  it("respeta el tope exacto", () => {
    expect(repartirPorCuota(candidatos(), (c) => c.bloque, 10)).toHaveLength(10);
  });

  it("reparte parejo entre los bloques", () => {
    const elegidos = repartirPorCuota(candidatos(), (c) => c.bloque, 10);
    const porBloque = new Map<number, number>();
    for (const c of elegidos) porBloque.set(c.bloque, (porBloque.get(c.bloque) ?? 0) + 1);
    for (const [, cantidad] of porBloque) expect(cantidad).toBeGreaterThan(0);
    // 10 entre 4 bloques = 2-3 cada uno: la diferencia tiene que ser de a lo sumo 1.
    expect(Math.max(...porBloque.values()) - Math.min(...porBloque.values())).toBeLessThanOrEqual(1);
  });

  it("conserva el orden de aparición dentro de cada bloque", () => {
    const elegidos = repartirPorCuota(candidatos(), (c) => c.bloque, 10);
    // El sub-tema 1 del apunte sigue siendo el primero que entra de su bloque.
    expect(elegidos.filter((c) => c.bloque === 0)[0]?.nombre).toBe("a1");
  });

  it("devuelve todo sin tocar si no hay que cortar", () => {
    expect(repartirPorCuota(candidatos().slice(0, 5), (c) => c.bloque, 10)).toHaveLength(5);
  });

  it("con topes chicos sigue entrando el final del documento", () => {
    for (const tope of [4, 6, 8, 10, 12]) {
      const elegidos = repartirPorCuota(candidatos(), (c) => c.bloque, tope);
      expect(elegidos).toHaveLength(Math.min(tope, 17));
      expect(elegidos.filter((c) => c.bloque === 3).length).toBeGreaterThan(0);
    }
  });

  it("un bloque corto no monopoliza, y entra completo cuando el tope alcanza", () => {
    // Tope 6 con 4 bloques: da 2-2-2-1. El bloque corto (2 candidatos) entra 1 porque no hay
    // lugar para más, pero la diferencia con los demás es de a lo sumo 1.
    const conSeis = repartirPorCuota(candidatos(), (c) => c.bloque, 6);
    expect(conSeis.filter((c) => c.bloque === 0)).toHaveLength(2);
    expect(conSeis.filter((c) => c.bloque === 3)).toHaveLength(1);

    // Tope 8: ahora sí alcanza y el bloque corto aporta los 2 que tiene.
    const conOcho = repartirPorCuota(candidatos(), (c) => c.bloque, 8);
    expect(conOcho.filter((c) => c.bloque === 3)).toHaveLength(2);
    expect(conOcho.filter((c) => c.bloque === 0)).toHaveLength(2);
  });

  it("no duplica candidatos", () => {
    const elegidos = repartirPorCuota(candidatos(), (c) => c.bloque, 10);
    expect(new Set(elegidos.map((c) => c.nombre)).size).toBe(elegidos.length);
  });

  it("devuelve vacío con tope 0 o negativo", () => {
    expect(repartirPorCuota(candidatos(), (c) => c.bloque, 0)).toEqual([]);
    expect(repartirPorCuota(candidatos(), (c) => c.bloque, -3)).toEqual([]);
  });
});

describe("ordenarPorAparicion", () => {
  it("ordena por la posición en el documento", () => {
    const texto = "primero. luego segundo. al final tercero.";
    expect(ordenarPorAparicion(["tercero", "primero", "segundo"], texto, (x) => x)).toEqual([
      "primero",
      "segundo",
      "tercero",
    ]);
  });

  it("conserva el orden original en los empates", () => {
    expect(ordenarPorAparicion(["b", "a"], "texto", (x) => x)).toEqual(["b", "a"]);
  });
});

describe("derivarTema", () => {
  it("saltea encabezados y nombres de archivo", () => {
    expect(derivarTema("# react-algo.md\n\n## Challenge: Date Counter con fecha dinámica")).toBe(
      "Challenge: Date Counter con fecha dinámica"
    );
  });

  it("usa la primera línea si no hay nada mejor", () => {
    expect(derivarTema("# Solo")).toBe("Solo");
  });

  it("no se pasa del largo pedido", () => {
    expect(derivarTema("palabra ".repeat(50), 20).length).toBeLessThanOrEqual(21);
  });
});

describe("esParecido", () => {
  it("detecta reformulaciones", () => {
    expect(esParecido("Closures en JavaScript", "Closures")).toBe(true);
  });

  it("separa conceptos distintos", () => {
    expect(esParecido("Closures", "Promesas")).toBe(false);
  });
});

describe("normalizarParaSimilitud", () => {
  it("quita acentos, mayúsculas y puntuación", () => {
    expect(normalizarParaSimilitud("Árboles, Nodos y Hojas.")).toBe("arboles nodos y hojas");
  });
});

describe("deduplicarPorSimilitud", () => {
  it("deja la primera de cada grupo parecido", () => {
    expect(deduplicarPorSimilitud(["Closures en JS", "Closures", "Promesas"], (x) => x)).toEqual([
      "Closures en JS",
      "Promesas",
    ]);
  });
});

describe("extraerExcerpt", () => {
  const texto = `${"relleno ".repeat(200)}PALABRA CLAVE${" relleno".repeat(200)}`;

  it("centra el excerpt donde aparece el término", () => {
    const excerpt = extraerExcerpt(texto, "PALABRA CLAVE", 500);
    expect(excerpt).toContain("PALABRA CLAVE");
    expect(excerpt.length).toBeLessThan(600);
  });

  it("devuelve el texto entero si es corto", () => {
    expect(extraerExcerpt("corto", "corto", 500)).toBe("corto");
  });

  it("cae al head si el término no aparece (el motivo de querer `subtemas.fragmento`)", () => {
    expect(extraerExcerpt(texto, "término inexistente", 300).length).toBeLessThan(400);
  });
});
