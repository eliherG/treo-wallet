import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { MobileAuthError } from '../../auth/controller';
import { TransferScreen } from '../TransferScreen';

const OWNER = '99999999-9999-4999-8999-999999999999';
const mockOwner = OWNER;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const TRANSFER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const mockData = new Map<string, string>();
const mockGet = jest.fn<Promise<unknown>, [string]>();
const mockPost = jest.fn<Promise<unknown>, [string, object, (string | undefined)?]>();

jest.mock('../../auth/SessionProvider', () => ({
  useSession: () => ({
    user: { id: mockOwner, name: 'Demo', email: 'demo@treo.test' },
    authorizedGet: mockGet,
    authorizedPost: mockPost,
  }),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockData.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockData.set(key, value); }),
  deleteItemAsync: jest.fn(async (key: string) => { mockData.delete(key); }),
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => KEY) }));

const accounts = [
  { id: A, clabeMasked: '**************0011', currency: 'MXN', balanceCents: '1000000', status: 'ACTIVE' },
  { id: B, clabeMasked: '**************0022', currency: 'MXN', balanceCents: '200000', status: 'ACTIVE' },
];
const receipt = {
  id: TRANSFER_ID, status: 'COMPLETED', kind: 'OWN_ACCOUNTS', sourceAccountId: A,
  destinationAccountMasked: '**************0022', amountCents: '125', concept: 'Móvil', reference: '0001234',
  requiresOtp: false, createdAt: '2026-10-23T16:00:00.000Z', completedAt: '2026-10-23T16:00:01.000Z', rejectionCode: null,
};

async function fillAndReview(amount = '1.25') {
  await waitFor(() => expect(screen.getByLabelText('Importe MXN')).toBeTruthy());
  fireEvent.press(screen.getByText('Cuenta **************0022'));
  fireEvent.changeText(screen.getByLabelText('Importe MXN'), amount);
  fireEvent.changeText(screen.getByLabelText('Concepto'), 'Móvil');
  fireEvent.changeText(screen.getByLabelText('Referencia'), '0001234');
  fireEvent.press(screen.getByText('Revisar transferencia'));
  await waitFor(() => expect(screen.getByText('PASO 2 · REVISA ANTES DE ENVIAR')).toBeTruthy());
}

beforeEach(() => {
  mockData.clear(); mockGet.mockReset(); mockPost.mockReset();
  mockGet.mockImplementation(async path => {
    if (path === '/accounts') return { accounts };
    if (path === '/beneficiaries') return { beneficiaries: [] };
    if (path === `/transfers/${TRANSFER_ID}`) return { transfer: receipt };
    throw new Error('Ruta GET inesperada: ' + path);
  });
});

describe('T-29 · Flujos visuales de transferencias', () => {
  it('impide enviar montos inválidos desde la pantalla', async () => {
    render(<TransferScreen />);
    await waitFor(() => expect(screen.getByLabelText('Importe MXN')).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText('Importe MXN'), '1.234');
    expect(screen.getByRole('button', { name: 'Revisar transferencia' }).props.accessibilityState?.disabled).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('no presenta comprobante hasta que el backend confirma COMPLETED', async () => {
    mockPost.mockResolvedValueOnce({ transfer: receipt });
    render(<TransferScreen />);
    await fillAndReview();
    expect(mockPost).not.toHaveBeenCalled(); // explicit review gate
    fireEvent.press(screen.getByText('Confirmar transferencia'));
    await waitFor(() => expect(screen.getByText('COMPROBANTE · COMPLETADA')).toBeTruthy());
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/transfers', expect.objectContaining({ amount: '1.25', reference: '0001234' }), KEY);
    const serialized = [...mockData.values()].join(' ');
    expect(serialized).toContain(KEY);
    expect(serialized).not.toContain('accessToken');
    expect(serialized).not.toContain('refreshToken');
    expect(serialized).not.toContain('otp');
  });

  it('un fallo de red exige reintentar la misma intención, no muestra éxito ficticio', async () => {
    mockPost.mockRejectedValueOnce(new MobileAuthError(0, 'NETWORK_ERROR', 'Timeout tras commit'));
    mockPost.mockResolvedValueOnce({ transfer: receipt });
    render(<TransferScreen />);
    await fillAndReview();
    fireEvent.press(screen.getByText('Confirmar transferencia'));
    await waitFor(() => expect(screen.getByText('RESULTADO NO CONFIRMADO')).toBeTruthy());
    expect(screen.queryByText('COMPROBANTE · COMPLETADA')).toBeNull();
    fireEvent.press(screen.getByText('Reintentar misma intención'));
    await waitFor(() => expect(screen.getByText('COMPROBANTE · COMPLETADA')).toBeTruthy());
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost.mock.calls[0]?.[2]).toBe(KEY);
    expect(mockPost.mock.calls[1]?.[2]).toBe(KEY);
    expect(mockPost.mock.calls[0]?.[1]).toEqual(mockPost.mock.calls[1]?.[1]);
  });

  it('OTP incorrecto conserva estado pendiente y solo muestra comprobante tras código válido', async () => {
    const pending = { ...receipt, status: 'PENDING_CONFIRMATION', amountCents: '500001', requiresOtp: true, completedAt: null };
    const highReceipt = { ...receipt, amountCents: '500001' };
    mockPost.mockImplementation(async (path, payload) => {
      if (path === '/transfers') return { transfer: pending };
      if (path === `/transfers/${TRANSFER_ID}/confirm`) {
        if ((payload as {otp:string}).otp === '123456') return { transfer: highReceipt };
        throw new MobileAuthError(422, 'INVALID_OTP', 'OTP incorrecto');
      }
      throw new Error('Ruta POST inesperada: ' + path);
    });
    render(<TransferScreen />);
    await fillAndReview('5000.01');
    fireEvent.press(screen.getByText('Confirmar transferencia'));
    await waitFor(() => expect(screen.getByText('PASO 3 · AUTORIZACIÓN OTP')).toBeTruthy());
    expect(screen.queryByText('COMPROBANTE · COMPLETADA')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Código OTP'), '000000');
    fireEvent.press(screen.getByText('Confirmar OTP'));
    await waitFor(() => expect(screen.getByText(/OTP incorrecto/)).toBeTruthy());
    expect(screen.queryByText('COMPROBANTE · COMPLETADA')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Código OTP'), '123456');
    fireEvent.press(screen.getByText('Confirmar OTP'));
    await waitFor(() => expect(screen.getByText('COMPROBANTE · COMPLETADA')).toBeTruthy());
    expect(mockPost).toHaveBeenCalledTimes(3);
    expect(mockPost.mock.calls[2]?.[2]).toBeUndefined();
  });
});
