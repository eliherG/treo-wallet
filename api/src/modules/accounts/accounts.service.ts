import type { components, TreoAccount } from '@treo/shared';
import type { DataSource } from 'typeorm';
import { AccountEntity } from './entities/account.entity.js';

type AccountsResponse = components['schemas']['AccountsResponse'];

type StoredAccount = Pick<AccountEntity,
  'id' | 'clabe' | 'currency' | 'balanceCents' | 'status'>;

/** Explicitly whitelist fields: never serialize AccountEntity directly. */
function toPublicAccount(account: StoredAccount): TreoAccount {
  if (!/^\d{18}$/.test(account.clabe)) {
    throw new Error('Invalid account CLABE stored in database');
  }
  const currency = account.currency.trim();
  if (currency !== 'MXN') {
    throw new Error('Unexpected currency stored in database');
  }
  if (account.status !== 'ACTIVE' && account.status !== 'BLOCKED') {
    throw new Error('Unexpected account status stored in database');
  }
  if (typeof account.balanceCents !== 'string' || !/^(0|[1-9]\d*)$/.test(account.balanceCents)) {
    throw new Error('Invalid account balance stored in database');
  }

  return {
    id: account.id,
    clabeMasked: `${'*'.repeat(14)}${account.clabe.slice(-4)}`,
    currency,
    balanceCents: account.balanceCents,
    status: account.status,
  };
}

export class AccountsService {
  constructor(private readonly db: DataSource) {}

  async listOwnAccounts(userId: string): Promise<AccountsResponse> {
    const accounts = await this.db.getRepository(AccountEntity).find({
      // Only the authenticated JWT subject is allowed to supply this identifier.
      where: { userId },
      select: {
        id: true,
        clabe: true,
        currency: true,
        balanceCents: true,
        status: true,
      },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return { accounts: accounts.map(toPublicAccount) };
  }
}
