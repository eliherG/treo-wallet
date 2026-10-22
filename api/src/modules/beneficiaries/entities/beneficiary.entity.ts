import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { UserEntity } from '../../auth/entities/user.entity.js';

/** T-04: ownership and basic CLABE format are enforced in PostgreSQL. */
@Entity({ name: 'beneficiaries' })
@Unique('uq_beneficiaries_user_clabe', ['userId', 'clabe'])
@Check('chk_beneficiaries_clabe_digits', '"clabe" ~ \'^[0-9]{18}$\'')
export class BeneficiaryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user!: UserEntity;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  alias!: string;

  // The CLABE checksum is validated at service level in T-12.
  @Column({ type: 'char', length: 18 })
  clabe!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
