import { describe, expect, it } from 'vitest';
import { parseTransferForm, toCents } from '../draft';

const own = { mode: 'OWN_ACCOUNTS' as const,
  sourceAccountId: '11111111-1111-4111-8111-111111111111',
  targetId: '22222222-2222-4222-8222-222222222222',
  amount: '1500.25', concept: 'Pago', reference: '0019' };

describe('T-23 importe y validaciones exactas', () => {
  it('convierte MXN a centavos mediante bigint sin redondear', () => {
    expect(toCents('0.01')).toBe(1n);
    expect(toCents('1500.25')).toBe(150025n);
    expect(toCents('100.5')).toBe(10050n);
    expect(toCents('90071992547409.91')).toBe(9007199254740991n);
  });
  it('conserva ceros iniciales de referencia y elige exactamente un destino', () => {
    expect(parseTransferForm(own).request).toEqual({sourceAccountId:own.sourceAccountId,destinationAccountId:own.targetId,amount:'1500.25',concept:'Pago',reference:'0019'});
    const beneficiary = parseTransferForm({...own,mode:'BENEFICIARY' as const});
    expect(beneficiary.request).toHaveProperty('beneficiaryId',own.targetId);
    expect(beneficiary.request).not.toHaveProperty('destinationAccountId');
  });
  it('rechaza monto cero, decimales de más, monto negativo y rango bigint', () => {
    for (const amount of ['0','0.00','1.001','-1','92233720368547759.00']) {
      expect(parseTransferForm({...own,amount}).errors.amount,amount).toBeTruthy();
    }
  });
  it('rechaza cuentas iguales, referencias no numéricas y concepto vacío', () => {
    expect(parseTransferForm({...own,targetId:own.sourceAccountId}).errors.targetId).toBeTruthy();
    expect(parseTransferForm({...own,reference:'ab'}).errors.reference).toBeTruthy();
    expect(parseTransferForm({...own,concept:'  '}).errors.concept).toBeTruthy();
  });
});
