import { Fase, Categoria, ResultadoFase, Score } from '../../types';

// Simple threshold for understanding: average score must be >= 70
const UMTRAP = 70;

export function evaluarComprension(scores: Score[]): boolean {
  if (!scores.length) return false;
  const avg = scores.reduce((s, c) => s + c.puntaje, 0) / scores.length;
  return avg >= UMTRAP;
}

export function determinarSiguienteFase(faseActual: Fase, resultado: ResultadoFase): Fase {
  switch (faseActual) {
    case 'sondeo':
      return 'prueba';
    case 'prueba':
      return 'ensenar';
    case 'ensenar':
      if (evaluarComprension(resultado.scores)) {
        return 'cerrar';
      } else {
        return 'prueba';
      }
    case 'cerrar':
      return 'cerrar'; // final state
    default:
      return 'cerrar';
  }
}
