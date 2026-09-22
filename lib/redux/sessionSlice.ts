// @ts-check
// Session slice using Redux Toolkit
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Fase } from '../../types';

export interface SessionState {
  sessionId: number | null;
  faseActual: Fase | null;
  topic: string | null;
}

const initialState: SessionState = {
  sessionId: null,
  faseActual: null,
  topic: null,
};

export const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    iniciarSesion: (state, action: PayloadAction<{ sessionId: number; topic: string }>) => {
      state.sessionId = action.payload.sessionId;
      state.topic = action.payload.topic;
      state.faseActual = null;
    },
    avanzarFase: (state, action: PayloadAction<Fase>) => {
      state.faseActual = action.payload;
    },
    reiniciarSesion: (state) => {
      state.sessionId = null;
      state.topic = null;
      state.faseActual = null;
    },
  },
});

export const { iniciarSesion, avanzarFase, reiniciarSesion } = sessionSlice.actions;
export default sessionSlice.reducer;
