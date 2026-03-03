import { User } from 'src/user/entities/user/user.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';

export type PaymentType = 'DEPOSIT' | 'BOOKING_CHARGE' | 'BOOKING_REFUND';
export type PaymentStatus = 'COMPLETED' | 'PENDING' | 'FAILED';

const numericTransformer = {
  to: (value: number) => value,
  from: (value: string | number | null): number => Number(value ?? 0),
};

@Entity({ name: 'payments' })
export class Payment {
  @PrimaryGeneratedColumn('identity', { type: 'int' })
  id: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  amount: number;

  @Column({ type: 'varchar' })
  currency: string;

  @Column({ type: 'varchar', default: 'DEPOSIT' })
  type: PaymentType;

  @Column({ type: 'varchar', default: 'COMPLETED' })
  status: PaymentStatus;

  @Column({ type: 'varchar', nullable: true })
  reference?: string | null;

  @Column({ type: 'varchar', nullable: true })
  description?: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.payments)
  user: User;
}
