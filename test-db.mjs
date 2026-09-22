import { crearSesion, actualizarFaseSesion, guardarIntento, guardarScore, obtenerProgresoSesion, obtenerHistorialScoresPorCategoria } from './lib/db/queries.ts';

async function runTest() {
  const sessionId = crearSesion('Test Topic');
  console.log('Created session', sessionId);

  actualizarFaseSesion(sessionId, 'Sondeo');
  console.log('Updated phase to Sondeo');

  guardarIntento(sessionId, '¿Qué es JS?', 'JavaScript', true, 'Correct');
  guardarIntento(sessionId, '¿Qué es TS?', 'TypeScript', false, 'Wrong');
  console.log('Inserted attempts');

  guardarScore(sessionId, 'gramatica', 8);
  guardarScore(sessionId, 'sintaxis', 7);
  console.log('Inserted scores');

  const progreso = obtenerProgresoSesion(sessionId);
  console.log('Progreso:', JSON.stringify(progreso, null, 2));

  const historial = obtenerHistorialScoresPorCategoria('gramatica');
  console.log('Historial gramatica:', historial);
}

runTest().catch(err => console.error(err));
