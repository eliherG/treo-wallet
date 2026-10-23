import { act, render, screen } from '@testing-library/react-native';
import { AppState, StyleSheet, type AppStateStatus } from 'react-native';
import { AppPrivacyCover } from '../AppPrivacyCover';

describe('T-29 · Renderizado de privacidad (RN)', () => {
  let dispatch: ((state: AppStateStatus) => void) | undefined;
  let previousAppState: AppStateStatus;
  const remove = jest.fn();
  beforeEach(() => {
    previousAppState = AppState.currentState;
    AppState.currentState = 'active';
    dispatch = undefined;
    remove.mockClear();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
      if (type === 'change') dispatch = handler as (state: AppStateStatus) => void;
      return { remove } as ReturnType<typeof AppState.addEventListener>;
    });
  });
  afterEach(() => {
    AppState.currentState = previousAppState;
    jest.restoreAllMocks();
  });

  it('oculta los datos con una capa opaca al entrar en background y la retira al volver', () => {
    render(<AppPrivacyCover />);
    expect(screen.queryByTestId('treo-privacy-cover')).toBeNull();
    expect(dispatch).toBeDefined();
    act(() => dispatch?.('background'));
    const overlay = screen.getByTestId('treo-privacy-cover');
    expect(overlay.props.accessibilityLabel).toBe('Contenido oculto por privacidad');
    expect(StyleSheet.flatten(overlay.props.style).backgroundColor).toBe('#112f3a');
    expect(StyleSheet.flatten(overlay.props.style).zIndex).toBe(9999);
    act(() => dispatch?.('active'));
    expect(screen.queryByTestId('treo-privacy-cover')).toBeNull();
  });

  it('cubre también el estado inactive y retira la suscripción al desmontar', () => {
    const view = render(<AppPrivacyCover />);
    act(() => dispatch?.('inactive'));
    expect(screen.getByText('Treo Wallet · Contenido protegido')).toBeTruthy();
    view.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
