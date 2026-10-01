// Helpers de texto compartidos por el servidor y el cliente.
import { EXCERPT_MAX_CHARS, SUBTEMAS_HEAD_CHARS } from "./config";

/**
 * Normaliza un texto para compararlo: colapsa espacios internos y baja a minúsculas.
 * Se usa para decidir si la opción elegida coincide con la correcta, sin depender
 * de espacios o mayúsculas que el usuario no controla.
 */
export function normalizarTexto(texto: string): string {
  return texto.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Deriva un tema legible a partir del texto que pegó el usuario.
 * Evita el problema anterior: el topic era literalmente los primeros 50 caracteres
 * del pegado, así que la lista de sesiones mostraba "# REACT-algo.md\n\n## Challenge: D".
 * Ahora saltea encabezados markdown, líneas con nombre de archivo y líneas cortas,
 * y usa la primera frase "de verdad" que encuentra.
 */
export function derivarTema(texto: string, maxLargo: number = 70): string {
  const lineas = texto
    .split(/\r?\n/)
    .map((linea) => linea.replace(/^[#>\-*\s]+/, "").trim())
    .filter((linea) => linea.length > 0);

  const pareceNombreDeArchivo = /\.(md|pdf|txt|json|tsx?|jsx?|css|html)\b/i;
  const util = lineas.find(
    (linea) => linea.split(/\s+/).length >= 4 && !pareceNombreDeArchivo.test(linea)
  );

  const base = (util ?? lineas[0] ?? texto.trim()).replace(/\s+/g, " ").trim();

  return base.length > maxLargo ? `${base.slice(0, maxLargo).trim()}…` : base;
}

/**
 * Fase B — Excerpt por subtema (punto 9).
 * En vez de mandar el textoOriginal entero (~50k chars de un PDF) a cada lote,
 * se manda solo el fragmento donde aparece el subtema. Resultado: ~95% menos
 * tokens de entrada → gemma4:26b responde en segundos en vez de minutos.
 * Si el subtema no aparece literal, se devuelve el head como fallback.
 */
export function extraerExcerpt(texto: string, subtema: string, maxChars: number = EXCERPT_MAX_CHARS): string {
  const limpio = texto.replace(/\r/g, "").trim();
  if (limpio.length <= maxChars) return limpio;

  const indice = limpio.toLowerCase().indexOf(subtema.trim().toLowerCase());
  if (indice === -1) return headPorParrafo(limpio, maxChars);

  // Se centra el excerpt en la primera mención, cortando por salto de línea.
  let inicio = Math.max(0, indice - Math.floor(maxChars / 3));
  let fin = Math.min(limpio.length, inicio + maxChars);
  const saltoInicio = limpio.lastIndexOf("\n", indice);
  if (saltoInicio !== -1 && saltoInicio > inicio - 400) inicio = saltoInicio + 1;
  const saltoFin = limpio.indexOf("\n", fin);
  if (saltoFin !== -1 && saltoFin < fin + 400) fin = saltoFin;
  return limpio.slice(inicio, fin).trim() || headPorParrafo(limpio, maxChars);
}

/** Head del texto cortado por párrafo: usado para extraer subtemas sin el PDF entero. */
export function headPorParrafo(texto: string, maxChars: number = SUBTEMAS_HEAD_CHARS): string {
  const limpio = texto.trim();
  if (limpio.length <= maxChars) return limpio;
  const corte = limpio.lastIndexOf("\n", maxChars);
  return (corte > maxChars * 0.5 ? limpio.slice(0, corte) : limpio.slice(0, maxChars)).trim();
}

// --- Calidad del sondeo (bloques + similitud) ----------------------------------
// Dos problemas reales que resuelven estos helpers: (1) con textos grandes el modelo
// solo veía el principio, así que salían pocos sub-temas y todos del mismo lado;
// (2) la anti-repetición comparaba textos por igualdad exacta, así que la misma
// pregunta reformulada entraba igual.

/** Palabras que no aportan significado al comparar dos sub-temas o enunciados. */
const PALABRAS_VACIAS = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas", "y", "o", "en",
  "con", "sin", "para", "por", "que", "al", "a", "su", "sus", "es", "son", "como",
  "cómo", "vs", "sobre", "entre", "lo", "se", "mas", "más", "muy", "dos", "tres",
]);

/** Baja a minúsculas, saca acentos y puntuación: base para comparar dos textos. */
export function normalizarParaSimilitud(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokens con significado de un texto (sin palabras vacías ni tokens de una letra). */
export function tokensSignificativos(texto: string): string[] {
  return normalizarParaSimilitud(texto)
    .split(" ")
    .filter((token) => token.length > 1 && !PALABRAS_VACIAS.has(token));
}

/** Similitud de Jaccard sobre tokens: 0 = nada en común, 1 = los mismos tokens. */
export function similitudTokens(a: string, b: string): number {
  const tokensA = new Set(tokensSignificativos(a));
  const tokensB = new Set(tokensSignificativos(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let comunes = 0;
  for (const token of tokensA) if (tokensB.has(token)) comunes++;
  return comunes / (tokensA.size + tokensB.size - comunes);
}

/**
 * ¿Dos textos hablan de lo mismo? Además del umbral de Jaccard se consideran parecidos
 * los casos de inclusión ("useState" vs "useState básico"), que Jaccard penaliza por
 * tener pocos tokens.
 */
export function esParecido(a: string, b: string, umbral: number = 0.6): boolean {
  const normalizadoA = normalizarParaSimilitud(a);
  const normalizadoB = normalizarParaSimilitud(b);
  if (!normalizadoA || !normalizadoB) return false;
  if (normalizadoA === normalizadoB) return true;
  if (normalizadoA.includes(normalizadoB) || normalizadoB.includes(normalizadoA)) return true;
  return similitudTokens(normalizadoA, normalizadoB) >= umbral;
}

/** Se queda con la primera aparición y descarta las que se parecen a algo ya visto. */
export function deduplicarPorSimilitud<T>(
  items: T[],
  comoTexto: (item: T) => string = (item) => String(item),
  umbral: number = 0.6
): T[] {
  const vistos: string[] = [];
  const unicos: T[] = [];
  for (const item of items) {
    const texto = comoTexto(item).trim();
    if (!texto) continue;
    if (vistos.some((previo) => esParecido(previo, texto, umbral))) continue;
    vistos.push(texto);
    unicos.push(item);
  }
  return unicos;
}

/** Posición de la primera aparición del texto (o de alguno de sus términos) en el documento. */
export function posicionEnTexto(documento: string, aguja: string): number {
  const normalizado = normalizarParaSimilitud(documento);
  if (!normalizado) return Number.MAX_SAFE_INTEGER;
  const literal = normalizado.indexOf(normalizarParaSimilitud(aguja));
  if (literal !== -1) return literal;
  let mejor = -1;
  for (const token of tokensSignificativos(aguja)) {
    const posicion = normalizado.indexOf(token);
    if (posicion !== -1 && (mejor === -1 || posicion < mejor)) mejor = posicion;
  }
  return mejor === -1 ? Number.MAX_SAFE_INTEGER : mejor;
}

/** Ordena por primera aparición en el documento; en empates conserva el orden original. */
export function ordenarPorAparicion<T>(items: T[], documento: string, comoTexto: (item: T) => string): T[] {
  return items
    .map((item, indice) => ({ item, indice, posicion: posicionEnTexto(documento, comoTexto(item)) }))
    .sort((a, b) => (a.posicion === b.posicion ? a.indice - b.indice : a.posicion - b.posicion))
    .map((entrada) => entrada.item);
}

/**
 * Selección por reparto, NO por orden global.
 *
 * El bug que corrige: `extraerSubtemas` ordenaba todos los candidatos por su aparición en el
 * documento y cortaba con `slice(0, max)`. Ordenar está bien (el sub-tema 1 del apunte es el
 * primero que se estudia), pero usar ese orden como criterio de SELECCIÓN hace que el material
 * largo se trunque siempre por el final: con un texto de 4 bloques y 17 candidatos, el corte se
 * llevaba los 2 del último bloque. El final del documento se perdía, que es justo lo que la
 * partición en bloques vino a arreglar.
 *
 * Ahora la cuota se reparte entre los bloques y, solo si sobra lugar, entra el resto por orden de
 * aparición. Cada bloque aporta primero los suyos, en el orden en que aparecen en el texto.
 *
 * Es una función pura a propósito: el reparto es la parte que hay que poder testear sin modelo.
 */
export function repartirPorCuota<T>(
  candidatos: T[],
  bloqueDe: (candidato: T) => number,
  max: number
): T[] {
  if (max <= 0) return [];
  if (candidatos.length <= max) return candidatos.slice();

  // Se agrupa por bloque conservando el orden de entrada (que ya viene por orden de aparición).
  const porBloque = new Map<number, T[]>();
  for (const candidato of candidatos) {
    const bloque = bloqueDe(candidato);
    const grupo = porBloque.get(bloque);
    if (grupo) grupo.push(candidato);
    else porBloque.set(bloque, [candidato]);
  }

  const grupos = [...porBloque.values()];
  const elegidos: T[] = [];
  const tomados = new Set<T>();

  // Ronda 1: unipo por bloque. Con 4 bloques y tope 10, cada uno entra hasta 3 veces antes de que
  // el primero vuelva a participar, así que el final del documento entra por construcción.
  for (let vuelta = 0; vuelta < max; vuelta++) {
    let sumoAlgo = false;
    for (const grupo of grupos) {
      if (elegidos.length >= max) break;
      const candidato = grupo[vuelta];
      if (candidato === undefined || tomados.has(candidato)) continue;
      elegidos.push(candidato);
      tomados.add(candidato);
      sumoAlgo = true;
    }
    if (!sumoAlgo || elegidos.length >= max) break;
  }

  // Ronda 2: si algún bloque se quedó corto y quedó lugar, se completa por orden de aparición.
  if (elegidos.length < max) {
    for (const candidato of candidatos) {
      if (elegidos.length >= max) break;
      if (tomados.has(candidato)) continue;
      elegidos.push(candidato);
      tomados.add(candidato);
    }
  }

  return elegidos;
}

/**
 * Parte el texto en bloques para extraer sub-temas sin perder el final del documento.
 * Corta por párrafo (nunca en medio de una oración) y arrastra un solape para que un
 * concepto que cruza el límite no quede afuera. Si con el tamaño pedido salen más
 * bloques que `maxBloques`, se agrandan para cubrir TODO el texto en `maxBloques` bloques.
 */
export function dividirEnBloques(
  texto: string,
  maxChars: number,
  maxBloques: number,
  solapeChars: number = 300
): string[] {
  const limpio = texto.replace(/\r/g, "").trim();
  if (!limpio) return [];

  const tamano = Math.max(maxChars, Math.ceil(limpio.length / Math.max(1, maxBloques)));
  const parrafos = limpio
    .split(/\n+/)
    .map((parrafo) => parrafo.trim())
    .filter((parrafo) => parrafo.length > 0);

  const bloques: string[] = [];
  let actual = "";

  const cerrar = () => {
    if (actual.trim()) bloques.push(actual.trim());
    actual = "";
  };

  for (const parrafo of parrafos) {
    if (parrafo.length > tamano) {
      // Párrafo gigante (PDF sin saltos): se corta duro para que no se pierda nada.
      cerrar();
      for (let i = 0; i < parrafo.length; i += tamano) {
        bloques.push(parrafo.slice(i, i + tamano).trim());
      }
      continue;
    }
    if (actual.length + parrafo.length + 1 > tamano) cerrar();
    if (actual === "" && bloques.length > 0 && solapeChars > 0) {
      const anterior = bloques[bloques.length - 1];
      actual = anterior.slice(Math.max(0, anterior.length - solapeChars)).trim();
    }
    actual = actual ? `${actual}\n${parrafo}` : parrafo;
  }
  cerrar();

  return bloques;
}

