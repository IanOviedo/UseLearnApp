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
