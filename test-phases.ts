import { determinarSiguienteFase } from './lib/phases';
import { ResultadoFase } from './types';

function logTest(name: string, expected: string, actual: string) {
  const ok = expected === actual;
  console.log(`${ok ? '✓' : '✗'} ${name}: expected=${expected} got=${actual}`);
}

// Caso A
const faseA: ResultadoFase = { scores: [], aprobacion: false };
logTest('Caso A', 'prueba', determinarSiguienteFase('sondeo', faseA));

// Caso B: scores bajos
const faseB: ResultadoFase = { scores: [
  { categoria: 'gramatica', puntaje: 50 },
  { categoria: 'sintaxis', puntaje: 50 }
], aprobacion: false };
logTest('Caso B', 'prueba', determinarSiguienteFase('ensenar', faseB));

// Caso C: scores altos
const faseC: ResultadoFase = { scores: [
  { categoria: 'gramatica', puntaje: 90 },
  { categoria: 'sintaxis', puntaje: 90 }
], aprobacion: false };
logTest('Caso C', 'cerrar', determinarSiguienteFase('ensenar', faseC));
