import type { components, TreoBeneficiary } from '@treo/shared';
import { In, type DataSource } from 'typeorm';
import { HttpProblem } from '../../http/http-problem.js';
import { AccountEntity } from '../accounts/entities/account.entity.js';
import { BeneficiaryEntity } from './entities/beneficiary.entity.js';
import { maskClabe } from './clabe.js';
import type { CreateBeneficiaryInput } from './schemas.js';

type BeneficiariesResponse = components['schemas']['BeneficiariesResponse'];

type StoredBeneficiary = Pick<BeneficiaryEntity, 'id' | 'name' | 'alias' | 'clabe'>;

function publicBeneficiary(row: StoredBeneficiary, isInternal: boolean): TreoBeneficiary {
  return {
    id: row.id,
    name: row.name,
    alias: row.alias,
    clabeMasked: maskClabe(row.clabe),
    isInternal,
  };
}

/** SQL uniqueness is authoritative; no check-then-insert race condition. */
function isDuplicateBeneficiary(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('driverError' in error)) return false;
  const driver: unknown = error.driverError;
  return Boolean(driver && typeof driver === 'object'
    && 'code' in driver && driver.code === '23505'
    && 'constraint' in driver && driver.constraint === 'uq_beneficiaries_user_clabe');
}

export class BeneficiariesService {
  constructor(private readonly db: DataSource) {}

  async listOwn(userId: string): Promise<BeneficiariesResponse> {
    const rows = await this.db.getRepository(BeneficiaryEntity).find({
      where: { userId },
      select: { id: true, name: true, alias: true, clabe: true },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    if (rows.length === 0) return { beneficiaries: [] };

    // A single query determines which saved CLABEs currently resolve inside Treo.
    const accounts = await this.db.getRepository(AccountEntity).find({
      where: { clabe: In(rows.map((row) => row.clabe)) },
      select: { clabe: true },
    });
    const internalClabes = new Set(accounts.map((account) => account.clabe));
    return {
      beneficiaries: rows.map((row) => publicBeneficiary(row, internalClabes.has(row.clabe))),
    };
  }

  async create(userId: string, input: CreateBeneficiaryInput): Promise<TreoBeneficiary> {
    try {
      const result = await this.db.transaction(async (tx) => {
        const beneficiaries = tx.getRepository(BeneficiaryEntity);
        const saved = await beneficiaries.save(beneficiaries.create({
          userId,
          name: input.name,
          alias: input.alias,
          clabe: input.clabe,
        }));
        const isInternal = await tx.getRepository(AccountEntity)
          .existsBy({ clabe: input.clabe });
        return { saved, isInternal };
      });
      return publicBeneficiary(result.saved, result.isInternal);
    } catch (error) {
      if (isDuplicateBeneficiary(error)) {
        throw new HttpProblem(409, 'BENEFICIARY_ALREADY_EXISTS', 'Beneficiario duplicado',
          'La CLABE ya está registrada en tus beneficiarios.');
      }
      throw error;
    }
  }
}
