import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from '../../auth/entities/user.entity.js';
import { TransferEntity } from '../../transfers/entities/transfer.entity.js';

@Entity({ name: 'audit_events' })
export class AuditEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Nullable for system-originated audit events.
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actor_user_id', referencedColumnName: 'id' })
  actor!: UserEntity | null;

  @Column({ name: 'transfer_id', type: 'uuid', nullable: true })
  transferId!: string | null;

  @ManyToOne(() => TransferEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'transfer_id', referencedColumnName: 'id' })
  transfer!: TransferEntity | null;

  @Column({ type: 'text' })
  action!: string;

  // Only application-sanitized metadata; never secrets or complete CLABEs.
  @Column({ name: 'metadata_sanitized', type: 'jsonb', default: () => "'{}'::jsonb" })
  metadataSanitized!: Record<string, unknown>;

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
