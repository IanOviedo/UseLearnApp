export type Fase = 'sondeo' | 'prueba' | 'ensenar' | 'cerrar';
export type Categoria = 'gramatica' | 'sintaxis' | 'logica' | 'api';
export type Score = { categoria: Categoria; puntaje: number };
export interface ResultadoFase {
  scores: Score[];
  aprobacion: boolean;
}
