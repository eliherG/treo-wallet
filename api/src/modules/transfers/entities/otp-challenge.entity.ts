import {
  Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique,
} from 'typeorm';
import { TransferEntity } from './transfer.entity.js';

@Entity({ name: 'otp_challenges' })
@Unique('uq_otp_challenges_transfer', ['transferId'])
@Check('chk_otp_challenges_attempts', '"failed_attempts" BETWEEN 0 AND 3')
export class OtpChallengeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'transfer_id', type: 'uuid' })
  transferId!: string;

  @ManyToOne(() => TransferEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'transfer_id', referencedColumnName: 'id' })
  transfer!: TransferEntity;

  // Persist only a hash; plaintext OTP values never belong in the database.
  @Column({ name: 'code_hash', type: 'text' })
  codeHash!: string;

  @Column({ name: 'failed_attempts', type: 'integer', default: 0 })
  failedAttempts!: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;
}
