// Cierre de sesión (sección 6, ítems 9 y 10): el export a Obsidian y el catálogo curado
// de recursos. Ambas son funciones puras, así que se testean sin base ni modelo.
import { describe, it, expect } from "vitest";
import { generarMarkdownObsidian, type DatosExport } from "@/lib/exportar";
import { CATALOGO_RECURSOS, buscarRecursos, urlDeBusqueda } from "@/lib/recursos";
import type { Ejercicio, Explicacion, SubtemaEstado } from "@/lib/tipos";

function subtema(parcial: Partial<SubtemaEstado>): SubtemaEstado {
  return {
    id: 1,
    nombre: "Closures",
    fragmento: null,
    aciertosSeguidos: 0,
    intentos: 0,
    correctas: 0,
    incorrectas: 0,
    cubierto: false,
    saltado: false,
    ...parcial,
  };
}

const explicacion: Explicacion = {
  id: 1,
  subtemaId: 1,
  orden: 0,
  tipo: "que_es",
  titulo: "Qué es",
  contenido: "Un closure captura el ámbito.",
  ejemplo: null,
};

const ejercicio: Ejercicio = {
  id: 1,
  subtemaId: 1,
  orden: 0,
  tipo: "codigo",
  lenguaje: "js",
  variante: "js",
  enunciado: "Implementá un contador",
  plantilla: null,
  assertions: [],
  opciones: null,
  indiceCorrecta: null,
  pista: null,
  solucion: "let n = 0;",
  dificultad: "media",
};

function datos(parcial: Partial<DatosExport>): DatosExport {
  return {
    tema: "React básico",
    creadaEn: "2026-01-01",
    modo: "apunte",
    feedback: "Buen trabajo",
    subtemas: [subtema({ incorrectas: 1, cubierto: true })],
    material: [{ nombre: "Closures", explicaciones: [explicacion], ejercicios: [ejercicio] }],
    conceptos: [
      { nombre: "Closures", caja: 2, proximoRepaso: "2026-01-04 10:00:00", vecesAcierto: 3, vecesFallo: 1 },
    ],
    ...parcial,
  };
}

describe("export a Obsidian", () => {
  it("incluye frontmatter, mermaid, debilidades, material y repaso", () => {
    const md = generarMarkdownObsidian(datos({}));
    expect(md).toContain("tags:");
    expect(md).toContain("# React básico");
    expect(md).toContain("```mermaid");
    expect(md).toContain("graph TD");
    expect(md).toContain("## Debilidades");
    expect(md).toContain("Implementá un contador");
    expect(md).toContain("let n = 0;");
    expect(md).toContain("## Repaso programado");
    expect(md).toContain("2026-01-04 10:00:00");
  });

  it("marca como débiles los sub-temas sin dominar aunque no tengan errores", () => {
    const md = generarMarkdownObsidian(
      datos({ subtemas: [subtema({ cubierto: false })], material: [] })
    );
    expect(md).toContain("class N0 debil");
  });

  it("escapa las comillas de las etiquetas de Mermaid", () => {
    const md = generarMarkdownObsidian(datos({ tema: 'Módulo "X"' }));
    expect(md).toContain(`T["Módulo 'X'"]`);
    expect(md).not.toContain(`T["Módulo "X""]`);
  });

  it("no falla cuando no hay material generado", () => {
    const md = generarMarkdownObsidian(datos({ material: [] }));
    expect(md).toContain("_Sin material generado._");
  });
});

describe("catálogo de recursos", () => {
  it("un concepto normalizado no se mezcla", () => {
    const trozos = CATALOGO_RECURSOS[0];
    expect(trozos).toBeDefined();
    expect(CATALOGO_RECURSOS).toHaveLength(10);
  });

  it("encuentra el recurso de useState", () => {
    const encontrados = buscarRecursos("uso del hook useState");
    expect(encontrados.some((recurso) => recurso.url.includes("useState"))).toBe(true);
  });

  it("devuelve vacío si no hay match", () => {
    expect(buscarRecursos("fotosintesis")).toHaveLength(0);
  });

  it("el link de búsqueda va codificado (fallback que no se puede romper)", () => {
    expect(urlDeBusqueda("useState")).toBe(
      "https://www.youtube.com/results?search_query=useState%20tutorial%20espa%C3%B1ol"
    );
  });
});
