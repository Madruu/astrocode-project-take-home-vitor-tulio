import { Task } from 'src/task/entities/task/task.entity';
import { User } from 'src/user/entities/user/user.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

export type BookingStatus = 'BOOKED' | 'CONFIRMED' | 'CANCELLED';

@Entity({ name: 'bookings' })
export class Booking {
  @PrimaryGeneratedColumn('identity', { type: 'int' })
  id: number;

  @ManyToOne(() => User, (user) => user.bookings, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Task, (task) => task.bookings, { onDelete: 'CASCADE' })
  task: Task;

  @Column({ type: 'timestamp' })
  scheduledDate: Date;

  @Column({ type: 'varchar', default: 'BOOKED' })
  status: BookingStatus;

  @Column({ type: 'boolean', default: false })
  paid: boolean;
}
