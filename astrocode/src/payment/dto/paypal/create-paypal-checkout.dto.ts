import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePayPalCheckoutDto {
  @ApiProperty({ description: 'Deposit amount to charge in checkout' })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({
    description: 'Checkout currency',
    required: false,
    default: 'BRL',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({
    description: 'Checkout intent context',
    required: false,
    enum: ['wallet_deposit', 'external_payment'],
    default: 'wallet_deposit',
  })
  @IsOptional()
  @IsString()
  @IsIn(['wallet_deposit', 'external_payment'])
  purpose?: 'wallet_deposit' | 'external_payment';
}

export interface CreatePayPalCheckoutResponse {
  checkoutUrl: string;
  orderId: string;
  paymentReference: string;
}
