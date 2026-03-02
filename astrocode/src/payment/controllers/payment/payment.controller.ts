import { BadRequestException, Controller, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation } from '@nestjs/swagger';
import { CreatePaymentDto } from 'src/payment/dto/create-payment/create-payment.dto';
import { Payment } from 'src/payment/entities/payment/payment.entity';
import {
  PaymentService,
  WalletSummary,
} from 'src/payment/services/payment/payment.service';
import { Post, Get, HttpCode, Body } from '@nestjs/common';
import { Request } from 'express';
import { Req } from '@nestjs/common';
import { Booking } from 'src/booking/entities/booking/booking.entity';
import { PurchaseTaskDto } from 'src/task/dto/create-task.dto/create-task.dto';
import {
  CreateMercadoPagoCheckoutDto,
  CreateMercadoPagoCheckoutResponse,
} from 'src/payment/dto/mercado-pago/create-mercado-pago-checkout.dto';
import { ConfirmMercadoPagoPaymentDto } from 'src/payment/dto/mercado-pago/confirm-mercado-pago-payment.dto';
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('create')
  @HttpCode(201)
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Create a new payment for account balance' })
  createPayment(
    @Body() createPaymentDto: CreatePaymentDto,
    @Req() req: Request & { user: { userId: number } },
  ): Promise<Payment> {
    try {
      return this.paymentService.createPayment(
        req.user.userId,
        createPaymentDto,
      );
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('list')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get all payments' })
  getPayments(
    @Req() req: Request & { user: { userId: number } },
  ): Promise<Payment[]> {
    try {
      return this.paymentService.getPaymentsByUserId(req.user.userId);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('wallet')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get wallet summary for current user' })
  getWallet(
    @Req() req: Request & { user: { userId: number } },
  ): Promise<WalletSummary> {
    try {
      return this.paymentService.getWalletSummaryByUserId(req.user.userId);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('purchase-task')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Purchase a task directly from account balance' })
  purchaseTask(@Body() purchaseTaskDto: PurchaseTaskDto): Promise<Booking> {
    try {
      return this.paymentService.purchaseTask(purchaseTaskDto);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('mercado-pago/checkout')
  @HttpCode(201)
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Create Mercado Pago checkout preference (sandbox compatible)',
  })
  createMercadoPagoCheckout(
    @Body() input: CreateMercadoPagoCheckoutDto,
    @Req() req: Request & { user: { userId: number } },
  ): Promise<CreateMercadoPagoCheckoutResponse> {
    try {
      return this.paymentService.createMercadoPagoCheckout(
        req.user.userId,
        input,
      );
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('mercado-pago/confirm')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Confirm Mercado Pago approved payment and credit wallet',
  })
  confirmMercadoPagoPayment(
    @Body() input: ConfirmMercadoPagoPaymentDto,
    @Req() req: Request & { user: { userId: number } },
  ): Promise<Payment> {
    try {
      return this.paymentService.confirmMercadoPagoPayment(
        req.user.userId,
        input,
      );
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
