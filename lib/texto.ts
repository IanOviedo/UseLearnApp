// Helpers de texto compartidos por el servidor y el cliente.

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
