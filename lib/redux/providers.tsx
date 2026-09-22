"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReduxProviderWrapper } from "./ReduxProviderWrapper";

const queryClient = new QueryClient();

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <ReduxProviderWrapper>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </ReduxProviderWrapper>
  );
};