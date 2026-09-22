import { Provider } from 'react-redux';
import { store } from './store';

export const ReduxProviderWrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);
