import type { EntityManager } from 'typeorm';
import { z } from 'zod';
import { HttpProblem } from '../../http/http-problem.js';
import { AccountEntity } from '../accounts/entities/account.entity.js';
import { BeneficiaryEntity } from '../beneficiaries/entities/beneficiary.entity.js';
import { isValidClabe } from '../beneficiaries/clabe.js';
import type { TransferKind } from './entities/transfer.entity.js';
import { parseMxnToCents } from './money.js';
import { createTransferSchema } from './schemas.js';

const authenticatedId = z.string().uuid();

/** Internal instruction only: serialize monetary fields explicitly at JSON boundaries. */
export interface ValidatedTransferInstruction {
  kind: TransferKind;
  sourceAccountId: string;
  destinationAccountId: string;
  beneficiaryId: string | null;
  amountCents: bigint;
  concept: string;
  reference: string;
}

function unavailable(): HttpProblem {
  return new HttpProblem(403, 'RESOURCE_UNAVAILABLE', 'Recurso no disponible',
    'No es posible utilizar los recursos indicados.');
}

function incompatible(): HttpProblem {
  return new HttpProblem(422, 'INVALID_TRANSFER_INSTRUCTION', 'Instrucción no permitida',
    'La instrucción no cumple con las condiciones para transferir.');
}

type TransferAccount = Pick<AccountEntity, 'id' | 'status' | 'currency'>;

/** Pure eligibility check; ownership/existence must be established by the caller. */
export function validateTransferAccounts(source: TransferAccount, destination: TransferAccount): void {
  if (source.id.toLowerCase() === destination.id.toLowerCase()
    || source.status !== 'ACTIVE' || destination.status !== 'ACTIVE'
    || source.currency !== 'MXN' || destination.currency !== 'MXN') {
    throw incompatible();
  }
}

/**
 * Read-only validation. Identity MUST come from the authenticated context, never input.
 * T-15 must revalidate using its transaction manager after acquiring account locks;
 * this result alone does not authorize execution or guarantee funds/limit availability.
 */
export async function validateTransferInstruction(
  manager: EntityManager,
  authenticatedUserId: string,
  input: unknown,
): Promise<ValidatedTransferInstruction> {
  const parsed = createTransferSchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpProblem(400, 'INVALID_REQUEST', 'Solicitud inválida',
      'El cuerpo de la solicitud no cumple con el esquema esperado.');
  }
  // Defensive programming at the trusted boundary: an absent ID must never remove
  // an ownership filter in TypeORM. This is a caller error, not request-body identity.
  if (!authenticatedId.safeParse(authenticatedUserId).success) {
    throw new Error('Valid authenticated user context is required');
  }
  const instruction = parsed.data;
  const accounts = manager.getRepository(AccountEntity);
  const select = { id: true, status: true, currency: true } as const;
  // Missing and foreign resources follow the same query and public error path.
  const source = await accounts.findOne({
    where: { id: instruction.sourceAccountId, userId: authenticatedUserId }, select,
  });
  if (!source) throw unavailable();

  let destination: AccountEntity | null;
  let beneficiaryId: string | null = null;
  if (instruction.beneficiaryId !== undefined) {
    const beneficiary = await manager.getRepository(BeneficiaryEntity).findOne({
      where: { id: instruction.beneficiaryId, userId: authenticatedUserId },
      select: { id: true, clabe: true },
    });
    if (!beneficiary) throw unavailable();
    if (!isValidClabe(beneficiary.clabe)) throw incompatible();
    destination = await accounts.findOne({ where: { clabe: beneficiary.clabe }, select });
    if (!destination) throw incompatible();
    beneficiaryId = beneficiary.id;
  } else {
    // XOR is checked before any query; never pass an undefined ID to TypeORM.
    const destinationAccountId = instruction.destinationAccountId;
    if (destinationAccountId === undefined) throw unavailable();
    destination = await accounts.findOne({
      where: { id: destinationAccountId, userId: authenticatedUserId }, select,
    });
    if (!destination) throw unavailable();
  }

  validateTransferAccounts(source, destination);

  return {
    kind: beneficiaryId === null ? 'OWN_ACCOUNTS' : 'BENEFICIARY',
    sourceAccountId: source.id,
    destinationAccountId: destination.id,
    beneficiaryId,
    amountCents: parseMxnToCents(instruction.amount),
    concept: instruction.concept,
    reference: instruction.reference,
  };
}
