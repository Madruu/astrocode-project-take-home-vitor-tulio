import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Not, Repository } from 'typeorm';
import { Booking } from 'src/booking/entities/booking/booking.entity';
import { DataSource } from 'typeorm';
import {
  BlockBookingSlotDto,
  CreateBookingDto,
} from 'src/booking/dto/booking/create-booking/create-booking.dto';
import { Task } from 'src/task/entities/task/task.entity';
import { User } from 'src/user/entities/user/user.entity';
import { CancelBookingDto } from 'src/booking/dto/booking/create-booking/create-booking.dto';
import { PaymentService } from 'src/payment/services/payment/payment.service';

@Injectable()
export class BookingService {
  private static readonly MAX_CANCELLATIONS_PER_MONTH = 3;

  constructor(
    @InjectRepository(Booking)
    private bookingRepository: Repository<Booking>,
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    private dataSource: DataSource,
    private paymentService: PaymentService,
  ) {}

  async createBooking(
    bookingDto: CreateBookingDto,
    requesterUserId: number,
    requesterAccountType?: string,
  ): Promise<Booking> {
    const scheduledDate = new Date(bookingDto.scheduledDate);

    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      throw new BadRequestException('Invalid or past date');
    }
    if (
      bookingDto.userId !== requesterUserId &&
      requesterAccountType !== 'PROVIDER'
    ) {
      throw new ForbiddenException(
        'You can only create bookings for your own user account',
      );
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
        status: paid ? 'CONFIRMED' : 'BOOKED',
        paid,
        paymentSource: 'wallet',
      });

      return manager.save(newBooking);
    });
  }

  async getBookings(userId: number, accountType?: string): Promise<Booking[]> {
    const foundBookings = await this.bookingRepository.find({
      where:
        accountType === 'PROVIDER'
          ? { task: { provider: { id: userId } } }
          : { user: { id: userId }, status: Not('BLOCKED') },
      relations: ['user', 'task', 'task.provider'],
    });
    if (!foundBookings) {
      throw new NotFoundException('Bookings not found');
    }
    return foundBookings;
  }

  async cancelBooking(
    cancelBookingDto: CancelBookingDto,
    requesterUserId: number,
    requesterAccountType?: string,
  ): Promise<Booking> {
    return this.dataSource.transaction(async (manager) => {
      const bookingToCancel = await manager.findOne(Booking, {
        where: { id: cancelBookingDto.bookingId },
        relations: ['user', 'task', 'task.provider'],
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
      const normalizedStatus = bookingToCancel.status?.toUpperCase();
      if (normalizedStatus === 'CANCELLED') {
        throw new BadRequestException('Booking already cancelled');
      }

      const isBookingOwner = bookingToCancel.user.id === requesterUserId;
      const isProviderOwner =
        requesterAccountType === 'PROVIDER' &&
        bookingToCancel.task.provider?.id === requesterUserId;

      if (normalizedStatus === 'BLOCKED') {
        if (!isProviderOwner) {
          throw new ForbiddenException(
            'Only the provider owner can unblock this slot',
          );
        }
        bookingToCancel.status = 'CANCELLED';
        bookingToCancel.paid = false;
        await manager.save(bookingToCancel);
        return bookingToCancel;
      }

      if (bookingToCancel.scheduledDate.getTime() <= Date.now()) {
        throw new BadRequestException(
          'Past bookings cannot be cancelled anymore',
        );
      }
      if (!isBookingOwner && !isProviderOwner) {
        throw new ForbiddenException(
          'You do not have permission to cancel this booking',
        );
      }

      if (isBookingOwner) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);

        const userBookingsInMonth = await manager.find(Booking, {
          where: {
            user: { id: bookingToCancel.user.id },
            scheduledDate: Between(monthStart, monthEnd),
          },
        });

        const cancellationsInMonth = userBookingsInMonth.filter(
          (booking) => booking.status?.toUpperCase() === 'CANCELLED',
        ).length;

        if (
          cancellationsInMonth >= BookingService.MAX_CANCELLATIONS_PER_MONTH
        ) {
          throw new BadRequestException(
            `Monthly cancellation limit reached (${BookingService.MAX_CANCELLATIONS_PER_MONTH})`,
          );
        }
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
          bookingToCancel,
          refundAmount,
        );
      }
      bookingToCancel.status = 'CANCELLED';
      bookingToCancel.paid = false;
      await manager.save(bookingToCancel);
      return bookingToCancel;
    });
  }

  async blockBookingSlot(
    blockSlotDto: BlockBookingSlotDto,
    requesterUserId: number,
    requesterAccountType?: string,
  ): Promise<Booking> {
    if (requesterAccountType !== 'PROVIDER') {
      throw new ForbiddenException('Only provider users can block slots');
    }

    const scheduledDate = new Date(blockSlotDto.scheduledDate);
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      throw new BadRequestException('Invalid or past date');
    }

    return this.dataSource.transaction(async (manager) => {
      const task = await manager.findOne(Task, {
        where: { id: blockSlotDto.taskId },
        relations: ['provider'],
      });
      if (!task) {
        throw new NotFoundException('Task not found');
      }
      if (!task.provider || task.provider.id !== requesterUserId) {
        throw new ForbiddenException(
          'You do not have permission to block this task slot',
        );
      }

      const existingBooking = await manager.findOne(Booking, {
        where: {
          task: { id: task.id },
          scheduledDate,
          status: In(['BOOKED', 'CONFIRMED', 'BLOCKED']),
        },
      });
      if (existingBooking) {
        throw new BadRequestException('Time slot already unavailable');
      }

      const blockedBooking = manager.create(Booking, {
        user: task.provider,
        task,
        scheduledDate,
        status: 'BLOCKED',
        paid: false,
      });
      return manager.save(blockedBooking);
    });
  }

  async getAvailableSlots(taskId: number, date: string): Promise<string[]> {
    const task = await this.taskRepository.findOne({
      where: { id: taskId },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Extract date part if ISO format (e.g. 2024-03-04T14:00:00.000Z)
    const datePart = date.includes('T') ? date.split('T')[0] : date;
    const isDdMmYyyy = /^\d{2}\/\d{2}\/\d{4}$/.test(datePart);
    const parts = datePart.split(isDdMmYyyy ? '/' : '-').map(Number);
    const [year, month, day] = isDdMmYyyy
      ? [parts[2], parts[1], parts[0]] // DD/MM/YYYY -> year, month, day
      : [parts[0], parts[1], parts[2]]; // YYYY-MM-DD
    const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0);
    if (isNaN(dayStart.getTime())) {
      throw new BadRequestException('Invalid date format');
    }
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const takenBookings = await this.bookingRepository.find({
      where: {
        task: { id: taskId },
        scheduledDate: Between(dayStart, dayEnd),
        status: In(['BOOKED', 'CONFIRMED', 'BLOCKED']),
      },
      select: ['scheduledDate'],
    });

    const takenSlots = new Set(
      takenBookings.map((booking) => booking.scheduledDate.toISOString()),
    );

    const slots: string[] = [];
    for (let hour = 8; hour <= 20; hour += 1) {
      const slot = new Date(dayStart);
      slot.setHours(hour, 0, 0, 0);
      const slotIso = slot.toISOString();
      if (!takenSlots.has(slotIso)) {
        slots.push(slotIso);
      }
    }

    return slots;
  }
}
