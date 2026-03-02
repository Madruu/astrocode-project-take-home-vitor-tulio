import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from 'src/booking/entities/booking/booking.entity';
import { DataSource } from 'typeorm';
import { CreateBookingDto } from 'src/booking/dto/booking/create-booking/create-booking.dto';
import { Task } from 'src/task/entities/task/task.entity';
import { User } from 'src/user/entities/user/user.entity';
import { CancelBookingDto } from 'src/booking/dto/booking/create-booking/create-booking.dto';
import { PaymentService } from 'src/payment/services/payment/payment.service';

@Injectable()
export class BookingService {
  constructor(
    @InjectRepository(Booking)
    private bookingRepository: Repository<Booking>,
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    private dataSource: DataSource,
    private paymentService: PaymentService,
  ) {}

  async createBooking(bookingDto: CreateBookingDto): Promise<Booking> {
    const scheduledDate = new Date(bookingDto.scheduledDate);

    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      throw new BadRequestException('Invalid or past date');
    }

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: bookingDto.userId },
        lock: { mode: 'pessimistic_write' }, // Ensure atomicity of the transaction
      });

      const task = await manager.findOne(Task, {
        where: { id: bookingDto.taskId },
      });

      if (!user || !task) {
        throw new NotFoundException();
      }

      const existingBooking = await manager.findOne(Booking, {
        where: {
          task: { id: task.id },
          scheduledDate,
        },
      });

      if (existingBooking) {
        throw new BadRequestException('Time slot already booked');
      }

      const { paid } = await this.paymentService.processBookingPayment({
        manager,
        user,
        task,
        scheduledDate,
        paymentMethod: bookingDto.paymentMethod,
      });

      const newBooking = manager.create(Booking, {
        scheduledDate,
        user,
        task,
        status: 'booked',
        paid,
      });

      return manager.save(newBooking);
    });
  }

  async getBookings(userId: number, accountType?: string): Promise<Booking[]> {
    const foundBookings = await this.bookingRepository.find({
      where:
        accountType === 'PROVIDER'
          ? { task: { provider: { id: userId } } }
          : { user: { id: userId } },
      relations: ['user', 'task', 'task.provider'],
    });
    if (!foundBookings) {
      throw new NotFoundException('Bookings not found');
    }
    return foundBookings;
  }

  async cancelBooking(cancelBookingDto: CancelBookingDto): Promise<Booking> {
    return this.dataSource.transaction(async (manager) => {
      const bookingToCancel = await manager.findOne(Booking, {
        where: { id: cancelBookingDto.bookingId },
        relations: ['user', 'task'],
      });
      if (!bookingToCancel) {
        throw new NotFoundException('Booking not found');
      }
      if (!bookingToCancel.user?.id) {
        throw new NotFoundException('Booking user not found');
      }
      if (!bookingToCancel.task) {
        throw new NotFoundException('Booking task not found');
      }
      if (bookingToCancel.status === 'cancelled') {
        throw new BadRequestException('Booking already cancelled');
      }
      const user = await manager.findOne(User, {
        where: { id: bookingToCancel.user.id },
      });
      if (!user) {
        throw new NotFoundException('User not found');
      }
      if (bookingToCancel.paid) {
        const refundAmount = Number(bookingToCancel.task.price);
        await this.paymentService.refundBookingPayment(
          manager,
          user,
          bookingToCancel.id,
          refundAmount,
        );
      }
      bookingToCancel.status = 'cancelled';
      bookingToCancel.paid = false;
      await manager.save(bookingToCancel);
      return bookingToCancel;
    });
  }
}
