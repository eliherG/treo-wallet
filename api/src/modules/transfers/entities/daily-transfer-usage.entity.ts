import {
  Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn,
} from 'typeorm';
import { UserEntity } from '../../auth/entities/user.entity.js';

@Entity({ name: 'daily_transfer_usage' })
@Check('chk_daily_transfer_usage_range', '"spent_cents" BETWEEN 0 AND 2000000')
export class DailyTransferUsageEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user!: UserEntity;

  // MX City calendar date, determined by the service after acquiring locks (T-15).
  @PrimaryColumn({ name: 'business_date', type: 'date' })
  businessDate!: string;

  @Column({ name: 'spent_cents', type: 'bigint', default: '0' })
  spentCents!: string;
}
