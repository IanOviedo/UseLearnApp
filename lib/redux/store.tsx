"use client";

import { configureStore } from "@reduxjs/toolkit";
import { Provider as ReduxProvider } from "react-redux";
import sessionReducer from "./sessionSlice";

export const store = configureStore({
  reducer: {
    session: sessionReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const ReduxProviderWrapper = ({ children }: { children: React.ReactNode }) => {
  return <ReduxProvider store={store}>{children}</ReduxProvider>;
};