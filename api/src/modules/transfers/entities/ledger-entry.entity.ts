import {
  Check, Column, CreateDateColumn, Entity, JoinColumn,
  ManyToOne, PrimaryGeneratedColumn, Unique,
} from 'typeorm';
import { AccountEntity } from '../../accounts/entities/account.entity.js';
import { TransferEntity } from './transfer.entity.js';

export type LedgerEntryType = 'DEBIT' | 'CREDIT';

@Entity({ name: 'ledger_entries' })
@Unique('uq_ledger_entries_transfer_type', ['transferId', 'type'])
@Check('chk_ledger_entries_signed_amount', '("type" = \'DEBIT\' AND "signed_amount_cents" < 0) OR ("type" = \'CREDIT\' AND "signed_amount_cents" > 0)')
export class LedgerEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'transfer_id', type: 'uuid' })
  transferId!: string;

  @ManyToOne(() => TransferEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'transfer_id', referencedColumnName: 'id' })
  transfer!: TransferEntity;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => AccountEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id', referencedColumnName: 'id' })
  account!: AccountEntity;

  // BIGINT must remain a string until domain logic converts it to bigint.
  @Column({ name: 'signed_amount_cents', type: 'bigint' })
  signedAmountCents!: string;

  @Column({ type: 'text' })
  type!: LedgerEntryType;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
