import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Payment } from 'src/payment/entities/payment/payment.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { CreatePaymentDto } from 'src/payment/dto/create-payment/create-payment.dto';
import { User } from 'src/user/entities/user/user.entity';
import { Booking } from 'src/booking/entities/booking/booking.entity';
import { Task } from 'src/task/entities/task/task.entity';
import { PurchaseTaskDto } from 'src/task/dto/create-task.dto/create-task.dto';
import {
  MercadoPagoConfig,
  Payment as MercadoPagoPayment,
  Preference,
} from 'mercadopago';
import {
  CreateMercadoPagoCheckoutDto,
  CreateMercadoPagoCheckoutResponse,
} from 'src/payment/dto/mercado-pago/create-mercado-pago-checkout.dto';
import { ConfirmMercadoPagoPaymentDto } from 'src/payment/dto/mercado-pago/confirm-mercado-pago-payment.dto';

export interface WalletSummary {
  balance: number;
  currency: string;
  totalDeposits: number;
  totalCharges: number;
  totalRefunds: number;
  pendingTransactions: number;
}

export interface ProcessBookingPaymentInput {
  manager: EntityManager;
  user: User;
  task: Task;
  scheduledDate: Date;
  paymentMethod: 'wallet' | 'direct';
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    private dataSource: DataSource,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService,
  ) {}

  private logMercadoPagoError(
    operation: 'create_checkout_preference' | 'fetch_payment',
    context: Record<string, unknown>,
    error: unknown,
  ): void {
    const maybeError = error as {
      message?: string;
      status?: number;
      code?: string;
      cause?: unknown;
    };
    const cause =
      maybeError?.cause && typeof maybeError.cause === 'object'
        ? (maybeError.cause as Record<string, unknown>)
        : undefined;

    this.logger.error(
      `Mercado Pago operation failed: ${operation}`,
      JSON.stringify({
        operation,
        ...context,
        status: maybeError?.status ?? cause?.status,
        code: maybeError?.code ?? cause?.code,
        blocked_by: cause?.blocked_by,
        message:
          maybeError?.message ??
          (typeof cause?.message === 'string' ? cause.message : undefined),
      }),
    );
  }

  async processBookingPayment({
    manager,
    user,
    task,
    scheduledDate,
    paymentMethod,
  }: ProcessBookingPaymentInput): Promise<{ paid: boolean; payment: Payment }> {
    const currentBalance = Number(user.balance);
    const taskPrice = Number(task.price);

    if (!Number.isFinite(currentBalance) || !Number.isFinite(taskPrice)) {
      throw new BadRequestException('Invalid balance or task price');
    }

    if (paymentMethod === 'wallet') {
      if (currentBalance < taskPrice) {
        throw new BadRequestException('Insufficient balance');
      }

      user.balance = currentBalance - taskPrice;
      await manager.save(user);
    }

    const payment = manager.create(Payment, {
      amount: taskPrice,
      currency: 'BRL',
      type: 'BOOKING_CHARGE',
      status: paymentMethod === 'wallet' ? 'COMPLETED' : 'PENDING',
      reference: `BOOKING-${task.id}-${scheduledDate.getTime()}`,
      description:
        paymentMethod === 'wallet'
          ? `Pagamento do agendamento para ${task.title}`
          : `Cobranca pendente do agendamento para ${task.title}`,
      user,
    });

    const savedPayment = await manager.save(payment);

    return {
      paid: paymentMethod === 'wallet',
      payment: savedPayment,
    };
  }

  async refundBookingPayment(
    manager: EntityManager,
    user: User,
    bookingId: number,
    refundAmount: number,
  ): Promise<Payment> {
    const currentBalance = Number(user.balance);

    if (!Number.isFinite(currentBalance) || !Number.isFinite(refundAmount)) {
      throw new BadRequestException('Invalid balance or refund amount');
    }

    user.balance = currentBalance + refundAmount;
    await manager.save(user);

    const refundPayment = manager.create(Payment, {
      amount: refundAmount,
      currency: 'BRL',
      type: 'BOOKING_REFUND',
      status: 'COMPLETED',
      reference: `REFUND-${bookingId}`,
      description: `Estorno do agendamento ${bookingId}`,
      user,
    });

    return manager.save(refundPayment);
  }

  async createPayment(
    userId: number,
    createPaymentDto: CreatePaymentDto,
  ): Promise<Payment> {
    return this.dataSource.transaction(async (manager) => {
      if (!Number.isInteger(userId)) {
        throw new BadRequestException('User id is required');
      }
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' }, // Ensure atomicity of the transaction
      });
      if (!user) {
        throw new NotFoundException('User not found');
      }
      const paymentAmount = Number(createPaymentDto.amount);
      if (!Number.isFinite(paymentAmount)) {
        throw new BadRequestException('Invalid payment amount');
      }
      if (paymentAmount <= 0) {
        throw new BadRequestException('Payment amount must be greater than 0');
      }

      const currentBalance = Number(user.balance);
      if (!Number.isFinite(currentBalance)) {
        throw new BadRequestException('Invalid user balance');
      }
      const newBalance = currentBalance + paymentAmount;
      if (newBalance > 1000000) {
        throw new BadRequestException('User balance cannot exceed 1000000');
      }
      user.balance = newBalance;
      await manager.save(user);

      const payment = manager.create(Payment, {
        amount: paymentAmount,
        currency: createPaymentDto.currency,
        type: 'DEPOSIT',
        status: 'COMPLETED',
        description: createPaymentDto.description ?? 'Deposito na carteira',
        reference: createPaymentDto.reference ?? null,
        user,
      });
      const savedPayment = await manager.save(payment);
      return savedPayment;
    });
  }

  async getPaymentsByUserId(userId: number): Promise<Payment[]> {
    return this.paymentRepository.find({
      where: { user: { id: userId } },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async getWalletSummaryByUserId(userId: number): Promise<WalletSummary> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['payments'],
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const payments = user.payments ?? [];
    const totalDeposits = payments
      .filter(
        (payment) =>
          payment.type === 'DEPOSIT' && payment.status === 'COMPLETED',
      )
      .reduce((total, payment) => total + Number(payment.amount), 0);

    const totalCharges = payments
      .filter(
        (payment) =>
          payment.type === 'BOOKING_CHARGE' && payment.status === 'COMPLETED',
      )
      .reduce((total, payment) => total + Number(payment.amount), 0);

    const totalRefunds = payments
      .filter(
        (payment) =>
          payment.type === 'BOOKING_REFUND' && payment.status === 'COMPLETED',
      )
      .reduce((total, payment) => total + Number(payment.amount), 0);

    const pendingTransactions = payments.filter(
      (payment) => payment.status === 'PENDING',
    ).length;

    return {
      balance: Number(user.balance ?? 0),
      currency: 'BRL',
      totalDeposits,
      totalCharges,
      totalRefunds,
      pendingTransactions,
    };
  }

  async createMercadoPagoCheckout(
    userId: number,
    input: CreateMercadoPagoCheckoutDto,
  ): Promise<CreateMercadoPagoCheckoutResponse> {
    const accessToken = this.configService.get<string>('MP_ACCESS_TOKEN');
    if (!accessToken) {
      throw new BadRequestException(
        'Mercado Pago is not configured. Set MP_ACCESS_TOKEN first.',
      );
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than 0');
    }

    const currency = input.currency?.trim() || 'BRL';
    const paymentRecord = await this.paymentRepository.save(
      this.paymentRepository.create({
        amount,
        currency,
        type: 'DEPOSIT',
        status: 'PENDING',
        description: 'Deposito aguardando confirmacao do Mercado Pago',
        reference: `MP-PENDING-${user.id}-${Date.now()}`,
        user,
      }),
    );

    const frontUrl =
      this.configService.get<string>('MP_FRONTEND_URL') ??
      'http://localhost:4200/account';
    const isTestMode =
      this.configService.get<string>('MP_TEST_MODE')?.toLowerCase() === 'true';
    const notificationUrl =
      this.configService.get<string>('MP_NOTIFICATION_URL') ?? undefined;
    const externalReference = `wallet_deposit:${paymentRecord.id}:user:${user.id}`;

    const client = new MercadoPagoConfig({ accessToken });
    const preferenceClient = new Preference(client);
    let preference;
    try {
      preference = await preferenceClient.create({
        body: {
          items: [
            {
              id: `wallet-deposit-${paymentRecord.id}`,
              title: `Deposito carteira Astrocode - Usuario ${user.id}`,
              quantity: 1,
              currency_id: currency,
              unit_price: amount,
            },
          ],
          ...(isTestMode
            ? {}
            : {
                payer: {
                  email: user.email,
                },
              }),
          external_reference: externalReference,
          notification_url: notificationUrl,
          back_urls: {
            success: `${frontUrl}?source=mercado_pago`,
            failure: `${frontUrl}?source=mercado_pago`,
            pending: `${frontUrl}?source=mercado_pago`,
          },
          auto_return: 'approved',
        },
      });
    } catch (error) {
      this.logMercadoPagoError(
        'create_checkout_preference',
        {
          userId,
          paymentRecordId: paymentRecord.id,
          externalReference,
        },
        error,
      );
      throw error;
    }

    paymentRecord.reference = preference.id ?? paymentRecord.reference;
    await this.paymentRepository.save(paymentRecord);

    return {
      checkoutUrl: preference.init_point ?? '',
      sandboxCheckoutUrl: preference.sandbox_init_point ?? '',
      paymentReference: externalReference,
    };
  }

  async confirmMercadoPagoPayment(
    userId: number,
    input: ConfirmMercadoPagoPaymentDto,
  ): Promise<Payment> {
    const accessToken = this.configService.get<string>('MP_ACCESS_TOKEN');
    if (!accessToken) {
      throw new BadRequestException(
        'Mercado Pago is not configured. Set MP_ACCESS_TOKEN first.',
      );
    }

    if (!input.paymentId?.trim()) {
      throw new BadRequestException('paymentId is required');
    }

    const client = new MercadoPagoConfig({ accessToken });
    const paymentClient = new MercadoPagoPayment(client);
    let mercadoPagoPayment;
    try {
      mercadoPagoPayment = await paymentClient.get({
        id: input.paymentId,
      });
    } catch (error) {
      this.logMercadoPagoError(
        'fetch_payment',
        {
          userId,
          paymentId: input.paymentId,
          externalReference: input.externalReference,
        },
        error,
      );
      throw error;
    }

    const status = mercadoPagoPayment.status?.toLowerCase();
    if (status !== 'approved') {
      throw new BadRequestException(
        `Mercado Pago payment is not approved (status: ${status ?? 'unknown'})`,
      );
    }

    const externalReference =
      mercadoPagoPayment.external_reference ?? input.externalReference;
    if (!externalReference) {
      throw new BadRequestException(
        'Unable to confirm payment without external reference',
      );
    }

    const referenceParts = externalReference.split(':');
    const paymentRecordId = Number(referenceParts[1]);
    const paymentUserId = Number(referenceParts[3]);
    if (
      !Number.isInteger(paymentRecordId) ||
      !Number.isInteger(paymentUserId)
    ) {
      throw new BadRequestException('Invalid external reference');
    }
    if (paymentUserId !== userId) {
      throw new BadRequestException(
        'Payment does not belong to authenticated user',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const paymentRecord = await manager.findOne(Payment, {
        where: { id: paymentRecordId },
        relations: ['user'],
      });

      if (!paymentRecord) {
        throw new NotFoundException('Pending payment not found');
      }
      if (!paymentRecord.user || paymentRecord.user.id !== userId) {
        throw new BadRequestException(
          'Pending payment does not belong to authenticated user',
        );
      }
      if (paymentRecord.status === 'COMPLETED') {
        return paymentRecord;
      }

      const user = await manager.findOne(User, {
        where: { id: userId },
      });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const currentBalance = Number(user.balance);
      const depositAmount = Number(paymentRecord.amount);
      if (!Number.isFinite(currentBalance) || !Number.isFinite(depositAmount)) {
        throw new BadRequestException('Invalid balance or payment amount');
      }

      const newBalance = currentBalance + depositAmount;
      if (newBalance > 1000000) {
        throw new BadRequestException('User balance cannot exceed 1000000');
      }

      user.balance = newBalance;
      await manager.save(user);

      paymentRecord.status = 'COMPLETED';
      paymentRecord.reference =
        mercadoPagoPayment.id?.toString() ?? paymentRecord.reference;
      paymentRecord.description = 'Deposito confirmado via Mercado Pago';
      return manager.save(paymentRecord);
    });
  }

  async purchaseTask(purchaseTaskDto: PurchaseTaskDto): Promise<Booking> {
    return this.dataSource.transaction(async (manager) => {
      const task = await manager.findOne(Task, {
        where: { id: purchaseTaskDto.taskId },
      });
      if (!task) {
        throw new NotFoundException('Task not found');
      }
      const user = await manager.findOne(User, {
        where: { id: purchaseTaskDto.userId },
      });
      if (!user) {
        throw new NotFoundException('User not found');
      }
      const currentBalance = Number(user.balance);
      const taskPrice = Number(task.price);
      if (!Number.isFinite(currentBalance) || !Number.isFinite(taskPrice)) {
        throw new BadRequestException('Invalid balance or task price');
      }
      if (currentBalance < taskPrice) {
        throw new BadRequestException('Insufficient balance');
      }
      user.balance = currentBalance - taskPrice;
      await manager.save(user);
      const taskPayment = manager.create(Payment, {
        amount: taskPrice,
        currency: 'BRL',
        type: 'BOOKING_CHARGE',
        status: 'COMPLETED',
        reference: `BOOKING-${task.id}-${Date.now()}`,
        description: `Pagamento do agendamento para ${task.title}`,
        user,
      });
      await manager.save(taskPayment);
      const booking = manager.create(Booking, {
        task,
        user,
        scheduledDate: new Date(),
        status: 'booked',
        paid: true,
      });
      return manager.save(booking);
    });
  }
}
