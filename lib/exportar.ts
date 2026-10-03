// Export a Obsidian (sección 6, ítem 10 del ESTADO): un .md con el bloque mermaid, las
// debilidades, el material con soluciones y el repaso programado.
//
// Función pura sobre los datos ya leídos: se testea sin base ni modelo, y el route solo se
// encarga de los headers. Así el formato no queda enterrado en un handler HTTP.
import type { Ejercicio, Explicacion, SubtemaEstado } from "./tipos";

export interface ConceptoExport {
  nombre: string;
  caja: number;
  proximoRepaso: string | null;
  vecesAcierto: number;
  vecesFallo: number;
}

export interface MaterialSubtema {
  nombre: string;
  explicaciones: Explicacion[];
  ejercicios: Ejercicio[];
}

export interface DatosExport {
  tema: string;
  creadaEn: string;
  modo: string;
  feedback: string | null;
  subtemas: SubtemaEstado[];
  material: MaterialSubtema[];
  conceptos: ConceptoExport[];
}

/** Escapa comillas para etiquetas de Mermaid. */
function etiqueta(texto: string): string {
  return texto.replace(/"/g, "'");
}

function bloqueMermaid(datos: DatosExport): string {
  const lineas = ["graph TD", `  T["${etiqueta(datos.tema)}"]`];
  const marcados: string[] = [];
  datos.subtemas.forEach((subtema, indice) => {
    lineas.push(`  T --> N${indice}["${etiqueta(subtema.nombre)}"]`);
    if (subtema.incorrectas > 0 || !subtema.cubierto) marcados.push(`N${indice}`);
  });
  lineas.push("  classDef debil fill:#2b1214,stroke:#b91c1c,color:#fca5a5");
  if (marcados.length > 0) lineas.push(`  class ${marcados.join(",")} debil`);
  return lineas.join("\n");
}

/** Genera el `.md` completo a partir del estado de la sesión. */
export function generarMarkdownObsidian(datos: DatosExport): string {
  const dominados = datos.subtemas.filter((s) => s.cubierto).length;
  const debiles = datos.subtemas.filter((s) => s.incorrectas > 0);
  const sinDominar = datos.subtemas.filter((s) => !s.cubierto);

  const lineas: string[] = [];
  lineas.push("---");
  lineas.push("tags:");
  lineas.push("  - uselearn");
  lineas.push(`tema: "${datos.tema.replace(/"/g, "'")}"`);
  lineas.push("---");
  lineas.push("");
  lineas.push(`# ${datos.tema}`);
  lineas.push("");
  lineas.push(`> Sesión de useLearn · ${datos.creadaEn} · modalidad: ${datos.modo}`);
  lineas.push("");
  lineas.push("## Resumen");
  lineas.push(`- Sub-temas cubiertos: ${dominados} de ${datos.subtemas.length}`);
  lineas.push(`- A reforzar (fallaste al menos una vez): ${debiles.length}`);
  lineas.push(`- Sin dominar: ${sinDominar.length}`);
  lineas.push("");

  if (datos.feedback) {
    lineas.push("## Diagnóstico");
    lineas.push(datos.feedback.trim());
    lineas.push("");
  }

  lineas.push("## Mapa conceptual");
  lineas.push("");
  lineas.push("```mermaid");
  lineas.push(bloqueMermaid(datos));
  lineas.push("```");
  lineas.push("");

  if (debiles.length > 0) {
    lineas.push("## Debilidades");
    for (const subtema of debiles) {
      const total = subtema.correctas + subtema.incorrectas;
      lineas.push(`- **${subtema.nombre}**: ${subtema.correctas} de ${total} correctas`);
    }
    lineas.push("");
  }

  lineas.push("## Material de estudio");
  datos.subtemas.forEach((subtema, indice) => {
    const material = datos.material[indice];
    lineas.push("");
    lineas.push(`### ${indice + 1}. ${subtema.nombre}`);
    if (!material || (material.explicaciones.length === 0 && material.ejercicios.length === 0)) {
      lineas.push("");
      lineas.push("_Sin material generado._");
      return;
    }
    if (material.explicaciones.length > 0) {
      lineas.push("");
      lineas.push("#### Explicaciones");
      for (const explicacion of material.explicaciones) {
        lineas.push(`**${explicacion.titulo}** _(${explicacion.tipo})_`);
        lineas.push("");
        lineas.push(explicacion.contenido.trim());
        if (explicacion.ejemplo?.trim()) {
          lineas.push("");
          lineas.push(`> Ejemplo: ${explicacion.ejemplo.trim()}`);
        }
        lineas.push("");
      }
    }
    if (material.ejercicios.length > 0) {
      lineas.push("#### Ejercicios");
      material.ejercicios.forEach((ejercicio, i) => {
        const etiquetaLenguaje =
          ejercicio.tipo === "quiz" ? "quiz" : `codigo/${ejercicio.lenguaje}`;
        lineas.push(`**${i + 1}. [${etiquetaLenguaje}] ${ejercicio.enunciado}**`);
        lineas.push("");
        if (ejercicio.plantilla?.trim()) {
          lineas.push("```");
          lineas.push(ejercicio.plantilla.trim());
          lineas.push("```");
          lineas.push("");
        }
        if (ejercicio.pista?.trim()) lineas.push(`_Pista: ${ejercicio.pista.trim()}_`);
        const solucionQuiz =
          ejercicio.tipo === "quiz" && ejercicio.opciones && ejercicio.indiceCorrecta != null
            ? (ejercicio.opciones[ejercicio.indiceCorrecta] ?? "")
            : null;
        if (solucionQuiz) {
          lineas.push("");
          lineas.push("<details><summary>Solución</summary>");
          lineas.push("");
          lineas.push(solucionQuiz);
          lineas.push("");
          lineas.push("</details>");
        } else if (ejercicio.solucion?.trim()) {
          lineas.push("");
          lineas.push("<details><summary>Solución</summary>");
          lineas.push("");
          lineas.push("```");
          lineas.push(ejercicio.solucion.trim());
          lineas.push("```");
          lineas.push("");
          lineas.push("</details>");
        }
        lineas.push("");
      });
    }
  });

  if (datos.conceptos.length > 0) {
    lineas.push("");
    lineas.push("## Repaso programado");
    lineas.push("");
    lineas.push("| Concepto | Caja | Aciertos | Fallos | Próximo repaso |");
    lineas.push("|---|---|---|---|---|");
    for (const concepto of datos.conceptos) {
      lineas.push(
        `| ${concepto.nombre} | ${concepto.caja} | ${concepto.vecesAcierto} | ${concepto.vecesFallo} | ${concepto.proximoRepaso ?? "sin programar"} |`
      );
    }
  }

  lineas.push("");
  return lineas.join("\n");
}
