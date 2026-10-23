import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { LoginScreen } from '../LoginScreen';

const mockLogin = jest.fn<Promise<void>, [{ email: string; password: string }]>();
jest.mock('../../auth/SessionProvider', () => ({ useSession: () => ({ login: mockLogin }) }));

describe('T-29 · Autenticación en pantalla', () => {
  beforeEach(() => mockLogin.mockReset());

  it('rechaza credenciales vacías sin llamar al servidor y mantiene password seguro', () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(screen.getByText('Ingresa correo y contraseña válidos.')).toBeTruthy();
    expect(mockLogin).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Contraseña').props.secureTextEntry).toBe(true);
  });

  it('envía credenciales válidas y presenta el rechazo de login como alerta', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Credenciales inválidas.'));
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'demo@treo.test');
    fireEvent.changeText(screen.getByLabelText('Contraseña'), 'incorrecta');
    fireEvent.press(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(screen.getByText('Credenciales inválidas.')).toBeTruthy());
    expect(mockLogin).toHaveBeenCalledWith({ email: 'demo@treo.test', password: 'incorrecta' });
    expect(screen.getByText('Credenciales inválidas.').props.accessibilityRole).toBe('alert');
  });

  it('no presenta un error ficticio ante autenticación exitosa', async () => {
    mockLogin.mockResolvedValueOnce();
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'demo@treo.test');
    fireEvent.changeText(screen.getByLabelText('Contraseña'), 'válida');
    fireEvent.press(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Credenciales inválidas.')).toBeNull();
  });
});
