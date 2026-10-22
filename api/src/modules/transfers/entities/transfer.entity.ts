import {
  Check, Column, CreateDateColumn, Entity, JoinColumn,
  ManyToOne, PrimaryGeneratedColumn, Unique,
} from 'typeorm';
import { UserEntity } from '../../auth/entities/user.entity.js';
import { AccountEntity } from '../../accounts/entities/account.entity.js';
import { BeneficiaryEntity } from '../../beneficiaries/entities/beneficiary.entity.js';

export type TransferKind = 'BENEFICIARY' | 'OWN_ACCOUNTS';
export type TransferStatus = 'PROCESSING' | 'PENDING_CONFIRMATION' | 'COMPLETED' | 'REJECTED';

@Entity({ name: 'transfers' })
@Unique('uq_transfers_sender_idempotency', ['senderUserId', 'idempotencyKey'])
@Check('chk_transfers_amount_positive', '"amount_cents" > 0')
@Check('chk_transfers_kind', '"kind" IN (\'BENEFICIARY\', \'OWN_ACCOUNTS\')')
@Check('chk_transfers_status', '"status" IN (\'PROCESSING\', \'PENDING_CONFIRMATION\', \'COMPLETED\', \'REJECTED\')')
@Check('chk_transfers_different_accounts', '"source_account_id" IS DISTINCT FROM "destination_account_id"')
export class TransferEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'sender_user_id', type: 'uuid' })
  senderUserId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sender_user_id', referencedColumnName: 'id' })
  sender!: UserEntity;

  @Column({ name: 'source_account_id', type: 'uuid' })
  sourceAccountId!: string;

  @ManyToOne(() => AccountEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'source_account_id', referencedColumnName: 'id' })
  sourceAccount!: AccountEntity;

  // Nullable only to retain a rejected beneficiary intent when no internal account resolves.
  @Column({ name: 'destination_account_id', type: 'uuid', nullable: true })
  destinationAccountId!: string | null;

  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'destination_account_id', referencedColumnName: 'id' })
  destinationAccount!: AccountEntity | null;

  @Column({ name: 'beneficiary_id', type: 'uuid', nullable: true })
  beneficiaryId!: string | null;

  @ManyToOne(() => BeneficiaryEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'beneficiary_id', referencedColumnName: 'id' })
  beneficiary!: BeneficiaryEntity | null;

  @Column({ type: 'text' })
  kind!: TransferKind;

  // PostgreSQL BIGINT -> string, never JS number.
  @Column({ name: 'amount_cents', type: 'bigint' })
  amountCents!: string;

  @Column({ type: 'text' })
  concept!: string;

  @Column({ type: 'text' })
  reference!: string;

  @Column({ name: 'idempotency_key', type: 'text' })
  idempotencyKey!: string;

  @Column({ name: 'payload_hash', type: 'text' })
  payloadHash!: string;

  @Column({ type: 'text', default: 'PROCESSING' })
  status!: TransferStatus;

  @Column({ name: 'rejection_code', type: 'text', nullable: true })
  rejectionCode!: string | null;

  @Column({ name: 'requires_otp', type: 'boolean', default: false })
  requiresOtp!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
