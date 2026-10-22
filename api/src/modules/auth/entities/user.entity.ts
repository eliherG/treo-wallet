import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ name: 'users' })
@Unique('uq_users_email_canonical', ['emailCanonical'])
@Check('chk_users_name_length', 'char_length(btrim("name")) BETWEEN 2 AND 100')
@Check('chk_users_email_canonical', '"email_canonical" = lower(btrim("email_canonical")) AND char_length("email_canonical") > 0')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'email_canonical', type: 'text' })
  emailCanonical!: string;

  // This is a one-way hash, never a plaintext password.
  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
