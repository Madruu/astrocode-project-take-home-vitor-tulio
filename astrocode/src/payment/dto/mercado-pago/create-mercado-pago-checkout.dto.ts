import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateMercadoPagoCheckoutDto {
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
}

export interface CreateMercadoPagoCheckoutResponse {
  checkoutUrl: string;
  sandboxCheckoutUrl: string;
  paymentReference: string;
}
