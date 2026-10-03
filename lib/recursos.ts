// Catálogo curado de recursos (sección 11.5 del ESTADO).
//
// Advertencia de diseño, la más importante de esta pieza: un LLM que "recomienda videos"
// devuelve URLs plausibles que NO existen. Por eso el orden de confianza está invertido:
// catálogo verificado a mano + búsqueda, nunca URLs generadas. Si un concepto no matchea
// cae a un link de búsqueda, que no se puede romper.
import { tokensSignificativos } from "./texto";

export interface Recurso {
  titulo: string;
  url: string;
  /** Palabras clave normalizadas (sin acentos, minúsculas) para el match. */
  tags: string[];
  tipo: "doc" | "video";
}

export const CATALOGO_RECURSOS: Recurso[] = [
  {
    titulo: "MDN — Closures",
    url: "https://developer.mozilla.org/es/docs/Web/JavaScript/Closures",
    tags: ["closure", "closures", "clausura", "clausuras", "ambito", "scope", "lexico"],
    tipo: "doc",
  },
  {
    titulo: "MDN — Array",
    url: "https://developer.mozilla.org/es/docs/Web/JavaScript/Reference/Global_Objects/Array",
    tags: ["array", "arrays", "arreglo", "arreglos", "map", "filter", "reduce", "metodos"],
    tipo: "doc",
  },
  {
    titulo: "MDN — Funciones",
    url: "https://developer.mozilla.org/es/docs/Web/JavaScript/Guide/Functions",
    tags: ["funcion", "funciones", "function", "arrow", "parametros", "retorno"],
    tipo: "doc",
  },
  {
    titulo: "MDN — Trabajar con objetos",
    url: "https://developer.mozilla.org/es/docs/Web/JavaScript/Guide/Working_with_objects",
    tags: ["objeto", "objetos", "object", "propiedades", "destructuring", "desestructuracion"],
    tipo: "doc",
  },
  {
    titulo: "MDN — Promesas",
    url: "https://developer.mozilla.org/es/docs/Web/JavaScript/Guide/Using_promises",
    tags: ["promesa", "promesas", "promise", "async", "await", "asincronia", "asincrono"],
    tipo: "doc",
  },
  {
    titulo: "MDN — JavaScript asíncrono",
    url: "https://developer.mozilla.org/es/docs/Learn/JavaScript/Asynchronous",
    tags: ["asincronia", "asincrono", "callback", "event", "loop", "fetch"],
    tipo: "doc",
  },
  {
    titulo: "react.dev — Estado con useState",
    url: "https://es.react.dev/reference/react/useState",
    tags: ["usestate", "estado", "state", "hook", "hooks", "react", "contador"],
    tipo: "doc",
  },
  {
    titulo: "react.dev — useEffect",
    url: "https://es.react.dev/reference/react/useEffect",
    tags: ["useeffect", "efecto", "efectos", "effect", "hook", "hooks", "dependencias"],
    tipo: "doc",
  },
  {
    titulo: "react.dev — Props entre componentes",
    url: "https://es.react.dev/learn/passing-props-to-a-component",
    tags: ["componente", "componentes", "props", "jsx", "react"],
    tipo: "doc",
  },
  {
    titulo: "react.dev — Listas y keys",
    url: "https://es.react.dev/learn/rendering-lists",
    tags: ["lista", "listas", "list", "key", "keys", "render", "react"],
    tipo: "doc",
  },
];

/** Puntaje de match: cuántas palabras significativas del concepto caen en los tags. */
function puntajeRecurso(concepto: string, recurso: Recurso): number {
  const tokens = new Set(tokensSignificativos(concepto));
  if (tokens.size === 0) return 0;
  let score = 0;
  for (const tag of recurso.tags) {
    for (const token of tokens) {
      if (token === tag || token.startsWith(tag) || tag.startsWith(token)) score += 1;
    }
  }
  return score;
}

/** Hasta `limite` recursos relacionados con el concepto (vacío = no hay match). */
export function buscarRecursos(concepto: string, limite: number = 2): Recurso[] {
  return CATALOGO_RECURSOS.map((recurso) => ({ recurso, score: puntajeRecurso(concepto, recurso) }))
    .filter((entrada) => entrada.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map((entrada) => entrada.recurso);
}

/** Link de búsqueda: el fallback infinito, no se puede romper. */
export function urlDeBusqueda(concepto: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${concepto} tutorial español`)}`;
}
