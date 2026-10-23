import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../../../api/http';
import { formatMxnCents } from '../../accounts/money';
import { TransferFlowProvider } from '../TransferFlow';
import { TransferNewPage } from '../TransferNewPage';
import { TransferReviewPage } from '../TransferReviewPage';
import { TransferOtpPage } from '../TransferOtpPage';
import { TransferStatusPage } from '../TransferStatusPage';

const fixture = vi.hoisted(() => ({ fetch: vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>() }));
vi.mock('../../../app/SessionProvider', () => ({useSession: () => ({
  user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Demo' },
  authorizedFetch: fixture.fetch,
})}));
const source = '11111111-1111-4111-8111-111111111111';
const destination = '22222222-2222-4222-8222-222222222222';
const transferId = '33333333-3333-4333-8333-333333333333';
const accounts = {accounts: [
  {id:source,clabeMasked:'**************1234',balanceCents:'900000',currency:'MXN',status:'ACTIVE'},
  {id:destination,clabeMasked:'**************5678',balanceCents:'0',currency:'MXN',status:'ACTIVE'},
]};
function transfer(status: 'COMPLETED'|'PENDING_CONFIRMATION'|'REJECTED'|'PROCESSING', amount='150025') {
  return {id:transferId,status,kind:'OWN_ACCOUNTS',sourceAccountId:source,destinationAccountMasked:'**************5678',amountCents:amount,concept:'Pago prueba',reference:'000123',requiresOtp:status==='PENDING_CONFIRMATION',createdAt:'2026-10-22T12:00:00.000Z',completedAt:status==='COMPLETED'?'2026-10-22T12:00:01.000Z':null,rejectionCode:status==='REJECTED'?'INSUFFICIENT_FUNDS':null};
}
function renderTransfer(route='/transfer/new') {
  const queryClient = new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[route]}><TransferFlowProvider><Routes>
    <Route path="/transfer/new" element={<TransferNewPage/>}/>
    <Route path="/transfer/review" element={<TransferReviewPage/>}/>
    <Route path="/transfer/otp" element={<TransferOtpPage/>}/>
    <Route path="/transfer/:id" element={<TransferStatusPage/>}/>
  </Routes></TransferFlowProvider></MemoryRouter></QueryClientProvider>);
}
async function prepareReview(amount='1500.25') {
  const user = userEvent.setup();
  await screen.findByRole('heading',{name:/nueva transferencia/i});
  await within(screen.getByLabelText('Cuenta de origen')).findByRole('option',{name:/\*{14}1234/});
  await user.selectOptions(screen.getByLabelText('Cuenta de origen'), source);
  await user.selectOptions(screen.getByLabelText('Cuenta destino propia'),destination);
  await user.type(screen.getByLabelText('Monto (MXN)'),amount);
  await user.type(screen.getByLabelText('Concepto'),'Pago prueba');
  await user.type(screen.getByLabelText(/referencia numérica/i),'000123');
  await user.click(screen.getByRole('button',{name:/revisar transferencia/i}));
  await screen.findByRole('heading',{name:/revisa tu transferencia/i});
  return user;
}
beforeEach(() => {
  fixture.fetch.mockReset();
  fixture.fetch.mockImplementation(async path => {
    if(path==='/accounts') return accounts;
    if(path==='/beneficiaries') return {beneficiaries:[]};
    if(path===`/transfers/${transferId}`) return {transfer:transfer('COMPLETED')};
    throw new Error(`Missing test mock ${path}`);
  });
});
afterEach(()=>vi.clearAllMocks());

describe('T-23 flujo de transferencias web',()=>{
  it('no envía transferencias con campos inválidos',async()=>{
    renderTransfer();
    await userEvent.click(screen.getByRole('button',{name:/revisar transferencia/i}));
    expect(await screen.findByText('Selecciona una cuenta de origen activa.')).toBeInTheDocument();
    expect(fixture.fetch.mock.calls.some(([path])=>path==='/transfers')).toBe(false);
  });
  it('doble clic genera un único POST con llave y muestra comprobante solo tras COMPLETED',async()=>{
    let resolve!: (value: unknown)=>void;
    const pending = new Promise<unknown>(r=>{resolve=r;});
    fixture.fetch.mockImplementation(async path => path==='/accounts'?accounts:path==='/beneficiaries'?{beneficiaries:[]}:path==='/transfers'?pending:path===`/transfers/${transferId}`?{transfer:transfer('COMPLETED')}:Promise.reject(new Error(path)));
    renderTransfer(); await prepareReview();
    const button=screen.getByRole('button',{name:/confirmar transferencia/i});
    fireEvent.click(button); fireEvent.click(button);
    expect(fixture.fetch.mock.calls.filter(([path])=>path==='/transfers')).toHaveLength(1);
    const call=fixture.fetch.mock.calls.find(([path])=>path==='/transfers');
    const init=call?.[1] as RequestInit;
    const payload=JSON.parse(String(init.body)) as Record<string,string>;
    expect(payload).toMatchObject({sourceAccountId:source,destinationAccountId:destination,amount:'1500.25',reference:'000123'});
    expect((init.headers as Record<string,string>)['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.queryByText('Comprobante de transferencia')).not.toBeInTheDocument();
    resolve({transfer:transfer('COMPLETED')});
    expect(await screen.findByText('Comprobante de transferencia')).toBeInTheDocument();
  });
  it('muestra error 422 sin comprobante ni otro POST',async()=>{
    fixture.fetch.mockImplementation(async path => path==='/accounts'?accounts:path==='/beneficiaries'?{beneficiaries:[]}:path==='/transfers'?Promise.reject(new ApiError(422,'INSUFFICIENT_FUNDS','La cuenta no tiene fondos.')):Promise.reject(new Error(path)));
    renderTransfer();await prepareReview();
    await userEvent.click(screen.getByRole('button',{name:/confirmar transferencia/i}));
    expect(await screen.findByRole('alert')).toHaveTextContent(/INSUFFICIENT_FUNDS/);
    expect(screen.queryByText('Comprobante de transferencia')).not.toBeInTheDocument();
    expect(fixture.fetch.mock.calls.filter(([path])=>path==='/transfers')).toHaveLength(1);
  });
  it('en respuesta incierta reintenta la MISMA llave de idempotencia',async()=>{
    let tries=0;
    fixture.fetch.mockImplementation(async path => {
      if(path==='/accounts')return accounts;
      if(path==='/beneficiaries')return {beneficiaries:[]};
      if(path===`/transfers/${transferId}`)return {transfer:transfer('COMPLETED')};
      if(path==='/transfers'){tries++;if(tries===1)throw new ApiError(0,'NETWORK_ERROR','Sin conexión');return {transfer:transfer('COMPLETED')};}
      throw new Error(path);
    });
    renderTransfer();await prepareReview();
    await userEvent.click(screen.getByRole('button',{name:/confirmar transferencia/i}));
    expect(await screen.findByText(/se conserva la misma llave/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:/reintentar misma intención/i}));
    expect(await screen.findByText('Comprobante de transferencia')).toBeInTheDocument();
    const calls=fixture.fetch.mock.calls.filter(([path])=>path==='/transfers');
    expect(calls).toHaveLength(2);
    expect((calls[0]![1]!.headers as Record<string,string>)['Idempotency-Key']).toBe((calls[1]![1]!.headers as Record<string,string>)['Idempotency-Key']);
  });
  it('OTP pendiente no es comprobante y exige seis dígitos',async()=>{
    let confirmed = false;
    fixture.fetch.mockImplementation(async path => {
      if(path==='/accounts')return accounts;
      if(path==='/beneficiaries')return {beneficiaries:[]};
      if(path==='/transfers')return {transfer:transfer('PENDING_CONFIRMATION','500001')};
      if(path===`/transfers/${transferId}`)return {transfer:transfer(confirmed?'COMPLETED':'PENDING_CONFIRMATION','500001')};
      if(path===`/transfers/${transferId}/confirm`){confirmed=true;return {transfer:transfer('COMPLETED','500001')};}
      throw new Error(path);
    });
    renderTransfer();await prepareReview('5000.01');
    await userEvent.click(screen.getByRole('button',{name:/confirmar transferencia/i}));
    expect(await screen.findByRole('heading',{name:'Confirmación OTP'})).toBeInTheDocument();
    expect(screen.queryByText('Comprobante de transferencia')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/código otp/i),'123456');
    await userEvent.click(screen.getByRole('button',{name:/confirmar otp/i}));
    await waitFor(()=>expect(fixture.fetch.mock.calls.some(([path])=>path.endsWith('/confirm'))).toBe(true));
    expect(await screen.findByText('Comprobante de transferencia')).toBeInTheDocument();
  });
  it('beneficiario interno usa beneficiaryId y no destinationAccountId',async()=>{
    fixture.fetch.mockImplementation(async path => {
      if(path==='/accounts')return accounts;
      if(path==='/beneficiaries')return {beneficiaries:[{id:destination,name:'Persona B',alias:'Receptor B',clabeMasked:'**************5678',isInternal:true}]};
      if(path==='/transfers')return {transfer:transfer('COMPLETED')};
      if(path===`/transfers/${transferId}`)return {transfer:transfer('COMPLETED')};
      throw new Error(path);
    });
    renderTransfer();
    const user=userEvent.setup();
    await within(screen.getByLabelText('Cuenta de origen')).findByRole('option',{name:/\*{14}1234/});
    await user.selectOptions(screen.getByLabelText('Tipo de transferencia'),'BENEFICIARY');
    await screen.findByRole('option',{name:/Receptor B/});
    await user.selectOptions(screen.getByLabelText('Cuenta de origen'),source);
    await user.selectOptions(screen.getByLabelText('Beneficiario interno'),destination);
    await user.type(screen.getByLabelText('Monto (MXN)'),'0.01');
    await user.type(screen.getByLabelText('Concepto'),'Pago prueba');
    await user.type(screen.getByLabelText(/referencia numérica/i),'0019');
    await user.click(screen.getByRole('button',{name:/revisar transferencia/i}));
    expect(await screen.findByText(/Receptor B/)).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:/confirmar transferencia/i}));
    expect(await screen.findByText('Comprobante de transferencia')).toBeInTheDocument();
    const call=fixture.fetch.mock.calls.find(([path])=>path==='/transfers');
    const payload=JSON.parse(String(call?.[1]?.body)) as Record<string,string>;
    expect(payload.beneficiaryId).toBe(destination);
    expect(payload).not.toHaveProperty('destinationAccountId');
  });
  it('OTP inválido mantiene la operación pendiente sin comprobante',async()=>{
    fixture.fetch.mockImplementation(async path => {
      if(path===`/transfers/${transferId}`)return {transfer:transfer('PENDING_CONFIRMATION','500001')};
      if(path===`/transfers/${transferId}/confirm`)throw new ApiError(422,'OTP_INVALID','Código incorrecto.');
      throw new Error(path);
    });
    renderTransfer(`/transfer/otp?id=${transferId}`);
    const user=userEvent.setup();
    await screen.findByText(formatMxnCents('500001'));
    await user.type(screen.getByLabelText(/código otp/i),'000000');
    await user.click(screen.getByRole('button',{name:/confirmar otp/i}));
    expect(await screen.findByRole('alert')).toHaveTextContent(/OTP_INVALID/);
    expect(screen.queryByText('Comprobante de transferencia')).not.toBeInTheDocument();
    expect(fixture.fetch.mock.calls.filter(([path])=>path.endsWith('/confirm'))).toHaveLength(1);
  });
  it('rechazo de estado no exhibe comprobante',async()=>{
    fixture.fetch.mockImplementation(async path => path===`/transfers/${transferId}`?{transfer:transfer('REJECTED')}:Promise.reject(new Error(path)));
    renderTransfer(`/transfer/${transferId}`);
    expect(await screen.findByText(/transferencia rechazada/i)).toBeInTheDocument();
    expect(screen.queryByText('Comprobante de transferencia')).not.toBeInTheDocument();
  });
});
