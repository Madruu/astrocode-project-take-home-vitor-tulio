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
  CreatePayPalCheckoutDto,
  CreatePayPalCheckoutResponse,
} from 'src/payment/dto/paypal/create-paypal-checkout.dto';
import { ConfirmPayPalPaymentDto } from 'src/payment/dto/paypal/confirm-paypal-payment.dto';

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

export interface PayPalWebhookInput {
  headers: Record<string, unknown>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
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

  private logPayPalError(
    operation:
      | 'create_order'
      | 'capture_order'
      | 'verify_webhook'
      | 'fetch_order'
      | 'fetch_capture',
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
      `PayPal operation failed: ${operation}`,
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

  private getPayPalApiBaseUrl(): string {
    const mode = this.configService.get<string>('PAYPAL_MODE')?.toLowerCase();
    return mode === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  private getPayPalCheckoutBaseUrl(): string {
    const mode = this.configService.get<string>('PAYPAL_MODE')?.toLowerCase();
    return mode === 'live'
      ? 'https://www.paypal.com'
      : 'https://www.sandbox.paypal.com';
  }

  private getPayPalCredentials(): { clientId: string; clientSecret: string } {
    const clientId = this.configService.get<string>('PAYPAL_CLIENT_ID');
    const clientSecret = this.configService.get<string>('PAYPAL_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET first.',
      );
    }
    return { clientId, clientSecret };
  }

  private getPayPalFrontendUrl(): URL {
    const configuredFrontUrl =
      this.configService.get<string>('PAYPAL_FRONTEND_URL')?.trim() ??
      this.configService.get<string>('MP_FRONTEND_URL')?.trim() ??
      '';
    const fallbackFrontUrl = 'http://localhost:4200/account';
    const baseFrontUrl = configuredFrontUrl || fallbackFrontUrl;

    try {
      return new URL(baseFrontUrl);
    } catch {
      throw new BadRequestException(
        'Invalid PAYPAL_FRONTEND_URL. Configure an absolute URL (for example: https://myapp.com/account).',
      );
    }
  }

  private buildPayPalCheckoutRedirectConfig(): {
    returnUrl: string;
    cancelUrl: string;
  } {
    return this.buildPayPalCheckoutRedirectConfigWithSource('paypal');
  }

  private buildPayPalCheckoutRedirectConfigWithSource(source: string): {
    returnUrl: string;
    cancelUrl: string;
  } {
    const parsedBaseUrl = this.getPayPalFrontendUrl();
    const withPayPalSource = (
      status: 'approved' | 'cancelled',
      fromWebhook = false,
    ) => {
      const callbackUrl = new URL(parsedBaseUrl.toString());
      callbackUrl.searchParams.set('source', source);
      callbackUrl.searchParams.set('status', status);
      if (fromWebhook) {
        callbackUrl.searchParams.set('from_webhook', 'true');
      }
      return callbackUrl.toString();
    };
    return {
      returnUrl: withPayPalSource('approved'),
      cancelUrl: withPayPalSource('cancelled'),
    };
  }

  private getFirstString(value: unknown): string | null {
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value) && typeof value[0] === 'string') {
      return value[0];
    }
    return null;
  }

  private parsePayPalExternalReference(externalReference: string): {
    paymentRecordId: number;
    paymentUserId: number;
  } {
    const referenceParts = externalReference.split(':');
    const paymentRecordId = Number(referenceParts[1]);
    const paymentUserId = Number(referenceParts[3]);
    if (
      !Number.isInteger(paymentRecordId) ||
      !Number.isInteger(paymentUserId)
    ) {
      throw new BadRequestException('Invalid external reference');
    }
    return { paymentRecordId, paymentUserId };
  }

  private async createPayPalAccessToken(): Promise<string> {
    const { clientId, clientSecret } = this.getPayPalCredentials();
    const baseUrl = this.getPayPalApiBaseUrl();
    const auth = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString(
      'base64',
    );
    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const body = await response.text();
      throw new BadRequestException(
        `PayPal auth failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new BadRequestException('PayPal auth failed: missing access token');
    }
    return data.access_token;
  }

  private async payPalRequest<T>(
    endpoint: string,
    init: RequestInit,
    operation:
      | 'create_order'
      | 'capture_order'
      | 'verify_webhook'
      | 'fetch_order'
      | 'fetch_capture',
    context: Record<string, unknown>,
  ): Promise<T> {
    const baseUrl = this.getPayPalApiBaseUrl();
    const accessToken = await this.createPayPalAccessToken();
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        const body = await response.text();
        throw new BadRequestException(
          `PayPal request failed (${response.status}): ${body}`,
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      this.logPayPalError(operation, context, error);
      throw error;
    }
  }

  private async verifyPayPalWebhook(input: PayPalWebhookInput): Promise<void> {
    const webhookId = this.configService.get<string>('PAYPAL_WEBHOOK_ID');
    if (!webhookId) {
      return;
    }
    const transmissionId = this.getFirstString(
      input.headers['paypal-transmission-id'] ??
        input.headers['Paypal-Transmission-Id'] ??
        input.headers['PAYPAL-TRANSMISSION-ID'],
    );
    const transmissionTime = this.getFirstString(
      input.headers['paypal-transmission-time'] ??
        input.headers['Paypal-Transmission-Time'] ??
        input.headers['PAYPAL-TRANSMISSION-TIME'],
    );
    const transmissionSig = this.getFirstString(
      input.headers['paypal-transmission-sig'] ??
        input.headers['Paypal-Transmission-Sig'] ??
        input.headers['PAYPAL-TRANSMISSION-SIG'],
    );
    const certUrl = this.getFirstString(
      input.headers['paypal-cert-url'] ??
        input.headers['Paypal-Cert-Url'] ??
        input.headers['PAYPAL-CERT-URL'],
    );
    const authAlgo = this.getFirstString(
      input.headers['paypal-auth-algo'] ??
        input.headers['Paypal-Auth-Algo'] ??
        input.headers['PAYPAL-AUTH-ALGO'],
    );

    if (
      !transmissionId ||
      !transmissionTime ||
      !transmissionSig ||
      !certUrl ||
      !authAlgo
    ) {
      throw new BadRequestException('Invalid PayPal webhook signature headers');
    }

    const verification = await this.payPalRequest<{
      verification_status?: 'SUCCESS' | 'FAILURE';
    }>(
      '/v1/notifications/verify-webhook-signature',
      {
        method: 'POST',
        body: JSON.stringify({
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: webhookId,
          webhook_event: input.body,
        }),
      },
      'verify_webhook',
      {
        transmissionId,
      },
    );

    if (verification.verification_status !== 'SUCCESS') {
      throw new BadRequestException('PayPal webhook signature mismatch');
    }
  }

  private async fetchPayPalOrder(
    orderId: string,
    context: Record<string, unknown>,
  ): Promise<{
    id?: string;
    status?: string;
    purchase_units?: Array<{
      custom_id?: string;
      payments?: {
        captures?: Array<{
          id?: string;
          status?: string;
        }>;
      };
    }>;
  }> {
    return this.payPalRequest(
      `/v2/checkout/orders/${orderId}`,
      {
        method: 'GET',
      },
      'fetch_order',
      context,
    );
  }

  private async finalizeApprovedPayPalPayment(
    paymentRecordId: number,
    expectedUserId: number | null,
    payPalCaptureId?: string,
  ): Promise<Payment> {
    return this.dataSource.transaction(async (manager) => {
      const paymentRecord = await manager.findOne(Payment, {
        where: { id: paymentRecordId },
        relations: ['user'],
      });

      if (!paymentRecord) {
        throw new NotFoundException('Pending payment not found');
      }

      const paymentOwnerId = paymentRecord.user?.id;
      if (!paymentOwnerId) {
        throw new BadRequestException('Pending payment without owner');
      }
      if (expectedUserId !== null && paymentOwnerId !== expectedUserId) {
        throw new BadRequestException(
          'Pending payment does not belong to authenticated user',
        );
      }
      if (paymentRecord.status === 'COMPLETED') {
        return paymentRecord;
      }

      const user = await manager.findOne(User, {
        where: { id: paymentOwnerId },
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
      paymentRecord.reference = payPalCaptureId ?? paymentRecord.reference;
      paymentRecord.description = 'Deposito confirmado via PayPal';
      return manager.save(paymentRecord);
    });
  }

  private isPayPalPendingStatus(status?: string): boolean {
    if (!status) {
      return false;
    }
    return ['created', 'saved', 'approved', 'pending'].includes(
      status.toLowerCase(),
    );
  }

  private async finalizeFailedPayPalPayment(
    paymentRecordId: number,
    expectedUserId: number | null,
    payPalStatus: string,
    payPalCaptureId?: string,
  ): Promise<Payment> {
    return this.dataSource.transaction(async (manager) => {
      const paymentRecord = await manager.findOne(Payment, {
        where: { id: paymentRecordId },
        relations: ['user'],
      });

      if (!paymentRecord) {
        throw new NotFoundException('Pending payment not found');
      }

      const paymentOwnerId = paymentRecord.user?.id;
      if (!paymentOwnerId) {
        throw new BadRequestException('Pending payment without owner');
      }
      if (expectedUserId !== null && paymentOwnerId !== expectedUserId) {
        throw new BadRequestException(
          'Pending payment does not belong to authenticated user',
        );
      }
      if (paymentRecord.status === 'COMPLETED') {
        // Do not downgrade already credited deposits.
        return paymentRecord;
      }
      if (paymentRecord.status === 'FAILED') {
        return paymentRecord;
      }

      paymentRecord.status = 'FAILED';
      paymentRecord.reference = payPalCaptureId ?? paymentRecord.reference;
      paymentRecord.description = `Deposito rejeitado via PayPal (status: ${payPalStatus})`;
      return manager.save(paymentRecord);
    });
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
      status: 'COMPLETED',
      reference: `BOOKING-${task.id}-${scheduledDate.getTime()}`,
      description:
        paymentMethod === 'wallet'
          ? `Pagamento do agendamento para ${task.title}`
          : `Pagamento confirmado automaticamente para ${task.title}`,
      user,
    });

    const savedPayment = await manager.save(payment);

    return {
      paid: true,
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

  async createPayPalCheckout(
    userId: number,
    input: CreatePayPalCheckoutDto,
  ): Promise<CreatePayPalCheckoutResponse> {
    this.getPayPalCredentials();

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

    const purpose = input.purpose ?? 'wallet_deposit';
    const currency = input.currency?.trim().toUpperCase() || 'BRL';
    const isWalletDeposit = purpose === 'wallet_deposit';
    const paymentRecord = isWalletDeposit
      ? await this.paymentRepository.save(
          this.paymentRepository.create({
            amount,
            currency,
            type: 'DEPOSIT',
            status: 'PENDING',
            description: 'Deposito aguardando confirmacao do PayPal',
            reference: `PAYPAL-PENDING-${user.id}-${Date.now()}`,
            user,
          }),
        )
      : null;

    const redirectConfig = this.buildPayPalCheckoutRedirectConfigWithSource(
      isWalletDeposit ? 'paypal' : 'paypal_external',
    );
    const notificationUrl =
      this.configService.get<string>('PAYPAL_NOTIFICATION_URL') ?? undefined;
    const externalReference = isWalletDeposit
      ? `wallet_deposit:${paymentRecord?.id}:user:${user.id}`
      : `external_payment:user:${user.id}:ts:${Date.now()}`;

    const createOrderResponse = await this.payPalRequest<{
      id?: string;
      orderID?: string;
      links?: Array<{ rel?: string; href?: string }>;
    }>(
      '/v2/checkout/orders',
      {
        method: 'POST',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [
            {
              reference_id: isWalletDeposit
                ? `wallet-deposit-${paymentRecord?.id}`
                : `external-payment-user-${user.id}`,
              custom_id: externalReference,
              description: isWalletDeposit
                ? `Deposito carteira Astrocode - Usuario ${user.id}`
                : `Pagamento externo de servico - Usuario ${user.id}`,
              amount: {
                currency_code: currency,
                value: amount.toFixed(2),
              },
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                return_url: redirectConfig.returnUrl,
                cancel_url: redirectConfig.cancelUrl,
              },
            },
          },
          ...(notificationUrl ? { notify_url: notificationUrl } : {}),
        }),
      },
      'create_order',
      {
        userId,
        paymentRecordId: paymentRecord?.id ?? null,
        externalReference,
      },
    );

    const orderId = createOrderResponse.id ?? createOrderResponse.orderID ?? '';
    const approvalLink =
      createOrderResponse.links?.find((link) => {
        const rel = (link.rel ?? '').toLowerCase();
        return rel === 'approve' || rel === 'payer-action';
      })?.href ?? '';
    const checkoutUrl =
      approvalLink ||
      (orderId
        ? `${this.getPayPalCheckoutBaseUrl()}/checkoutnow?token=${orderId}`
        : '');

    if (!checkoutUrl || !orderId) {
      throw new BadRequestException(
        `PayPal order was created without checkout URL or order id (response: ${JSON.stringify(createOrderResponse)})`,
      );
    }

    if (paymentRecord) {
      paymentRecord.reference = orderId;
      await this.paymentRepository.save(paymentRecord);
    }

    return {
      checkoutUrl,
      orderId,
      paymentReference: externalReference,
    };
  }

  async confirmPayPalPayment(
    userId: number,
    input: ConfirmPayPalPaymentDto,
  ): Promise<Payment> {
    if (!input.orderId?.trim()) {
      throw new BadRequestException('orderId is required');
    }

    const captureResponse = await this.payPalRequest<{
      id?: string;
      status?: string;
      purchase_units?: Array<{
        custom_id?: string;
        payments?: {
          captures?: Array<{
            id?: string;
            status?: string;
          }>;
        };
      }>;
    }>(
      `/v2/checkout/orders/${input.orderId}/capture`,
      {
        method: 'POST',
        body: '{}',
      },
      'capture_order',
      {
        userId,
        orderId: input.orderId,
        externalReference: input.externalReference,
      },
    );

    const unit = captureResponse.purchase_units?.[0];
    const capture = unit?.payments?.captures?.[0];
    let externalReference = unit?.custom_id ?? input.externalReference;
    if (!externalReference) {
      const orderDetails = await this.fetchPayPalOrder(input.orderId, {
        source: 'confirm',
        orderId: input.orderId,
        userId,
      });
      externalReference = orderDetails.purchase_units?.[0]?.custom_id;
    }

    const status = (capture?.status ?? captureResponse.status)?.toLowerCase();
    let parsedReference = externalReference
      ? this.parsePayPalExternalReference(externalReference)
      : null;

    if (!parsedReference) {
      // Fallback for integrations where custom_id is not echoed in capture payload.
      const paymentByOrderId = await this.paymentRepository.findOne({
        where: {
          reference: input.orderId,
          user: { id: userId },
          type: 'DEPOSIT',
        },
        relations: ['user'],
      });
      if (paymentByOrderId) {
        parsedReference = {
          paymentRecordId: paymentByOrderId.id,
          paymentUserId: userId,
        };
      }
    }

    if (status !== 'completed') {
      if (status && !this.isPayPalPendingStatus(status) && parsedReference) {
        await this.finalizeFailedPayPalPayment(
          parsedReference.paymentRecordId,
          userId,
          status,
          capture?.id ?? captureResponse.id,
        );
      }
      throw new BadRequestException(
        `PayPal payment is not completed (status: ${status ?? 'unknown'})`,
      );
    }

    if (!parsedReference) {
      throw new BadRequestException(
        'Unable to confirm payment without external reference',
      );
    }

    const { paymentRecordId, paymentUserId } = parsedReference;
    if (paymentUserId !== userId) {
      throw new BadRequestException(
        'Payment does not belong to authenticated user',
      );
    }

    return this.finalizeApprovedPayPalPayment(
      paymentRecordId,
      userId,
      capture?.id ?? captureResponse.id,
    );
  }

  async handlePayPalWebhook(input: PayPalWebhookInput): Promise<void> {
    await this.verifyPayPalWebhook(input);

    const eventType = this.getFirstString(
      input.body?.event_type as unknown,
    )?.toUpperCase();
    const resource = (input.body?.resource ?? {}) as Record<string, unknown>;
    const resourceStatus = this.getFirstString(resource.status)?.toLowerCase();
    const supplementaryData = resource.supplementary_data as
      | Record<string, unknown>
      | undefined;
    const relatedIds = supplementaryData?.related_ids as
      | Record<string, unknown>
      | undefined;

    let externalReference =
      this.getFirstString(resource.custom_id) ??
      this.getFirstString(relatedIds?.custom_id);
    let captureId = this.getFirstString(resource.id);

    if (!externalReference) {
      const orderId = this.getFirstString(relatedIds?.order_id);
      if (orderId) {
        const order = await this.fetchPayPalOrder(orderId, {
          source: 'webhook',
          orderId,
          eventType,
        });
        externalReference = order.purchase_units?.[0]?.custom_id ?? null;
        captureId =
          order.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? captureId;
      }
    }

    if (!externalReference) {
      return;
    }

    if (!externalReference.startsWith('wallet_deposit:')) {
      return;
    }

    const { paymentRecordId } = this.parsePayPalExternalReference(
      externalReference,
    );

    if (
      eventType === 'PAYMENT.CAPTURE.COMPLETED' ||
      resourceStatus === 'completed'
    ) {
      await this.finalizeApprovedPayPalPayment(
        paymentRecordId,
        null,
        captureId ?? undefined,
      );
      return;
    }

    if (this.isPayPalPendingStatus(resourceStatus)) {
      return;
    }

    await this.finalizeFailedPayPalPayment(
      paymentRecordId,
      null,
      resourceStatus ?? eventType?.toLowerCase() ?? 'unknown',
      captureId ?? undefined,
    );
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
        status: 'CONFIRMED',
        paid: true,
      });
      return manager.save(booking);
    });
  }
}
