import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { UserEntity } from './user.entity.js';

@Entity({ name: 'refresh_tokens' })
@Unique('uq_refresh_tokens_token_hash', ['tokenHash'])
@Index('idx_refresh_tokens_user_family', ['userId', 'familyId'])
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user!: UserEntity;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId!: string;

  // Store an opaque token HASH only; token creation and rotation are T-10.
  @Column({ name: 'token_hash', type: 'text' })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'replaced_by_id', type: 'uuid', nullable: true })
  replacedById!: string | null;

  @ManyToOne(() => RefreshTokenEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'replaced_by_id', referencedColumnName: 'id' })
  replacedBy!: RefreshTokenEntity | null;
}
