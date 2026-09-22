"use client";

import { useEffect } from 'react';
import { useCrearSesionLearning, useProgreso } from '../lib/hooks/useHooks';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, store } from '../lib/redux/store';
import { iniciarSesion, avanzarFase } from '../lib/redux/sessionSlice';
import { Provider } from 'react-redux';

export default function Page() {
  const dispatch = useDispatch();
  const { sessionId, faseActual } = useSelector((state: RootState) => state.session);
  const { mutateAsync: crearSesion } = useCrearSesionLearning();
  const { data: progreso } = useProgreso(sessionId);

  useEffect(() => {
    async function init() {
      const id = await crearSesion('test topic');
      dispatch(iniciarSesion({ sessionId: id, topic: 'test topic' }));
    }
    if (!sessionId) init();
  }, [sessionId]);

  const avanzar = () => {
    dispatch(avanzarFase('prueba'));
  };

  return (
    <div>
      <h1>Prueba de sesión</h1>
      <p>Session ID: {sessionId ?? 'cargando...'}</p>
      <p>Fase actual: {faseActual ?? 'n/a'}</p>
      <p>Progreso: {JSON.stringify(progreso)}</p>
      <button onClick={avanzar}>Avanzar fase</button>
    </div>
  );
}

