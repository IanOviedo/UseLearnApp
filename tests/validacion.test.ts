// Validación local de lotes (lib/validacion.ts): la capa que decide qué pregunta llega al
// usuario sin gastar modelo. Es barata y por eso mismo fácil de romper sin que nadie note.
import { describe, it, expect } from "vitest";
import { distribucionSospechosa, validarLote } from "@/lib/validacion";
import type { Pregunta } from "@/lib/tipos";

function p(parcial: Partial<Pregunta>): Pregunta {
  return {
    pregunta: "que hace el hook usestate en un componente de react",
    opciones: [
      "guarda y actualiza el estado del componente",
      "imprime en consola el estado actual",
      "crea un nuevo componente de react",
      "ejecuta efectos secundarios",
    ],
    indiceCorrecta: 0,
    explicacion: "permite guardar y actualizar el estado",
    ...parcial,
  };
}

describe("validarLote", () => {
  it("acepta una pregunta bien formada", () => {
    const { validas, rechazadas } = validarLote([p({})]);
    expect(validas).toHaveLength(1);
    expect(rechazadas).toHaveLength(0);
  });

  it("rechaza un enunciado demasiado corto", () => {
    const { rechazadas } = validarLote([p({ pregunta: "que es esto" })]);
    expect(rechazadas[0]?.motivo).toContain("stem");
  });

  it("rechaza si no hay 4 opciones", () => {
    const { rechazadas } = validarLote([p({ opciones: ["a", "b", "c"] })]);
    expect(rechazadas[0]?.motivo).toContain("cantidad de opciones");
  });

  it("rechaza los comodines 'todas/ninguna de las anteriores'", () => {
    const { rechazadas } = validarLote([
      p({ opciones: ["todas las anteriores", "b", "c", "d"] }),
    ]);
    expect(rechazadas[0]?.motivo).toContain("comodín");
  });

  it("rechaza opciones duplicadas", () => {
    const { rechazadas } = validarLote([
      p({ opciones: ["misma opcion", "Misma Opcion", "otra", "otra mas"] }),
    ]);
    expect(rechazadas[0]?.motivo).toContain("duplicadas");
  });

  it("rechaza longitudes muy desbalanceadas (la correcta regalada por largo)", () => {
    const { rechazadas } = validarLote([
      p({
        opciones: [
          "corta",
          "media opcion",
          "otra media",
          "una opcion extremadamente larga que triplica a las demas",
        ],
      }),
    ]);
    expect(rechazadas[0]?.motivo).toContain("desbalanceadas");
  });

  it("rechaza preguntas sin explicación", () => {
    const { rechazadas } = validarLote([p({ explicacion: "" })]);
    expect(rechazadas[0]?.motivo).toContain("sin explicación");
  });

  it("rechaza una reformulación de algo ya visto en la sesión", () => {
    const { rechazadas } = validarLote(
      [p({})],
      ["que hace el hook usestate en un componente de react"]
    );
    expect(rechazadas[0]?.motivo).toContain("repite");
  });

  it("no marca duplicada a una pregunta distinta del propio lote", () => {
    const distinta = p({
      pregunta: "como se declara una variable let en javascript moderno",
      opciones: [
        "con la palabra reservada let",
        "con la palabra reservada const",
        "con la palabra reservada var",
        "sin palabra reservada",
      ],
      explicacion: "let permite reasignar el valor",
    });
    const { validas } = validarLote([p({}), distinta]);
    expect(validas).toHaveLength(2);
  });
});

describe("distribucionSospechosa", () => {
  it("es falso con menos de 3 preguntas", () => {
    expect(distribucionSospechosa([p({}), p({})])).toBe(false);
  });

  it("es verdadero si la correcta cae siempre en el mismo lugar", () => {
    const lote = [0, 0, 0, 0].map(() => p({ indiceCorrecta: 0 }));
    expect(distribucionSospechosa(lote)).toBe(true);
  });

  it("es falso si la posición de la correcta varía", () => {
    const lote = [0, 1, 2, 3].map((indice) => p({ indiceCorrecta: indice }));
    expect(distribucionSospechosa(lote)).toBe(false);
  });
});
