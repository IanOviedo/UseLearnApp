// Chequeo de código muerto: lista los exports de `lib/` que nadie importa.
//
// Por qué existe: el juez semántico (§10.1 de ESTADO.md) compilaba perfecto y `tsc` daba 0
// errores, pero `evaluarCalidadSemantica` no se llamaba desde ningún lado: el usuario recibía las
// preguntas sin filtrar y nadie se enteró. El build verifica que el código ANDE, no que se USE.
// Este script es el que hace notar ese caso solo.
//
// No reemplaza al code review: es un detector de guantes amarillos, no una prueba de que el repo
// no tenga código muerto. Por eso las excepciones están explícitas y con motivo.

import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const LIB = path.join(RAIZ, "lib");

/**
 * Exports que sí están sin uso a propósito, con el motivo. Cada entrada es una deuda conocida:
 * si algo deja de estar en esta lista, el chequeo falla y hay que borrarlo de acá. La lista se
 * mantiene chica a propósito: una excepción sin motivo real es cómo se cuela el código muerto.
 */
const EXCEPCIONES = new Map([
  [
    "db:guardarPregunta",
    "Código muerto desde Fase B: el guardado es por lote (guardarLotePreguntas). Se borra cuando se toque db.ts.",
  ],
  [
    "ollama:generarPregunta",
    "Compatibilidad: delega en generarLotePreguntas y devuelve la primera. Nadie lo llama.",
  ],
  ["db:obtenerPreguntasDelSubtema", "Sin uso: el sondeo usa obtenerPreguntasSinResponder."],
]);

/** Carpetas donde un import cuenta como "alguien lo usa". */
const RUTAS_IMPORTABLES = ["app", "components", "lib", "tests"];

function archivosDe(dir) {
  const salida = [];
  if (!fs.existsSync(dir)) return salida;
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === "node_modules" || entrada.name.startsWith(".")) continue;
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...archivosDe(completo));
    else if (/\.(ts|tsx)$/.test(entrada.name)) salida.push(completo);
  }
  return salida;
}

/**
 * Exports declarados en un archivo de `lib/`. Cubre las dos formas que usa el repo:
 * `export function foo` / `export const foo` y el bloque `export { a, b }` del final de db.ts.
 */
function exportsDe(contenido) {
  const nombres = new Set();

  const declaracion = /^\s*export\s+(?:async\s+)?(?:function|const|class|let|var)\s+([A-Za-z_$][\w$]*)/gm;
  for (const match of contenido.matchAll(declaracion)) nombres.add(match[1]);

  // Bloque `export { ... }` (con o sin `default`). Los comentarios se sacan antes de parsear:
  // un `/** ... */` dentro del bloque rompe la separación por comas y, además, no es un export.
  for (const match of contenido.matchAll(/^\s*export\s*\{([^}]*)\}/gms)) {
    const sinComentarios = match[1]
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    for (const parte of sinComentarios.split(",")) {
      const limpio = parte.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
      if (limpio) nombres.add(limpio);
    }
  }
  return [...nombres];
}

/** Nombres que un archivo usa de afuera: lo que importa y lo que nombra en `import type`. */
function nombresImportados(contenido) {
  const nombres = new Set();
  for (const match of contenido.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from/g)) {
    for (const parte of match[1].split(",")) {
      const limpio = parte.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]?.trim();
      if (limpio) nombres.add(limpio);
    }
  }
  // `import db from ...` (default) no se chequea: el default de lib/db.ts se usa widely.
  return nombres;
}

const libs = archivosDe(LIB);
const declarados = new Map(); // "archivo:nombre" -> nombre
for (const archivo of libs) {
  for (const nombre of exportsDe(fs.readFileSync(archivo, "utf8"))) {
    declarados.set(`${path.basename(archivo, ".ts")}:${nombre}`, nombre);
  }
}

// Todos los nombres importados en cualquier parte del proyecto.
const usados = new Set();
for (const carpeta of RUTAS_IMPORTABLES) {
  for (const archivo of archivosDe(path.join(RAIZ, carpeta))) {
    for (const nombre of nombresImportados(fs.readFileSync(archivo, "utf8"))) usados.add(nombre);
  }
}

// Un export que nadie importa puede ser dos cosas muy distintas:
//  - helper interno que se exporta "por las dudas" → ruido, no bug;
//  - feature que no conectó a ningún lado → el bug de §10.1 (el juez semántico).
// Lo que separa las dos es si el nombre se usa dentro de su propio archivo. Por eso el chequeo
// tiene dos niveles en vez de un error único.
function usosInternos(contenido, nombre) {
  // Se cuenta como uso cualquier aparición del identificador como palabra, que para estos
  // helpers equivale a "se llama o se referencia dentro del módulo".
  return new RegExp(`\\b${nombre}\\b`).test(contenido.replace(/^\s*export\s+.*$/gm, ""));
}

const sinUso = [];      // nadie lo usa: ni afuera ni adentro. Esto sí es código muerto o feature suelta.
const soloInterno = []; // se usa adentro pero está exportado sin motivo.
const excepcionadas = [];

for (const [clave, nombre] of declarados) {
  if (usados.has(nombre)) continue;
  if (EXCEPCIONES.has(clave)) {
    excepcionadas.push(clave);
    continue;
  }
  const propio = archivosDe(LIB).find((a) => path.basename(a, ".ts") === clave.split(":")[0]);
  if (propio && usosInternos(fs.readFileSync(propio, "utf8"), nombre)) soloInterno.push(clave);
  else sinUso.push(clave);
}

console.log(`exports en lib/: ${declarados.size}`);
console.log(`  importados por alguien:  ${declarados.size - sinUso.length - soloInterno.length - excepcionadas.length}`);
console.log(`  usados solo internamente: ${soloInterno.length}  (info: se exportan sin que nadie los importe)`);
console.log(`  excepcionados a propósito: ${excepcionadas.length}`);

// Una excepción que ya no aplica es peor que no tenerla: el chequeo tiene que fallar solo.
// Ojo: se evalúa contra TODAS las excepciones, no solo contra las que llegaron a `excepcionadas`
// (si una excepción ya se usa, se filtra antes y nunca llegaría al chequeo).
const obsoletas = [...EXCEPCIONES.keys()].filter((clave) => usados.has(declarados.get(clave)));
if (obsoletas.length > 0) {
  console.error("\nFALLA — EXCEPCIONES que ya no aplican (alguien las importa: sacalas de la lista):");
  for (const clave of obsoletas) console.error(`  - ${clave}`);
  process.exit(1);
}

if (soloInterno.length > 0) {
  console.log("\nINFO — exportados pero solo usados dentro de su propio módulo:");
  console.log("      (si no pensás importarlos desde otro lado, sacales el `export`)");
  for (const clave of soloInterno.sort()) console.log(`  - ${clave}`);
}

if (sinUso.length > 0) {
  console.error("\nFALLA — exports que NADIE usa (ni afuera ni adentro):");
  for (const clave of sinUso.sort()) console.error(`  - ${clave}`);
  console.error(
    "\nSi es código muerto: borrarlo.\n" +
      "Si es una feature sin conectar: conectarla (este fue el caso del juez semántico, §10.1).\n" +
      'Si es intencional: agregarlo a EXCEPCIONES con el motivo.'
  );
  process.exit(1);
}

console.log("\nOK: todo export de lib/ se usa en algún lado.");

