import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { UserEntity } from '../../auth/entities/user.entity.js';

@Entity({ name: 'accounts' })
@Unique('uq_accounts_clabe', ['clabe'])
@Index('idx_accounts_user_id', ['userId'])
@Check('chk_accounts_clabe_digits', '"clabe" ~ \'^[0-9]{18}$\'')
@Check('chk_accounts_currency_mxn', '"currency" = \'MXN\'')
@Check('chk_accounts_nonnegative_balance', '"balance_cents" >= 0')
export class AccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 18 })
  clabe!: string;

  @Column({ type: 'char', length: 3, default: 'MXN' })
  currency!: string;

  // PostgreSQL BIGINT -> string; services will use bigint, never number.
  @Column({ name: 'balance_cents', type: 'bigint', default: '0' })
  balanceCents!: string;

  @Column({ type: 'text', default: 'ACTIVE' })
  status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
