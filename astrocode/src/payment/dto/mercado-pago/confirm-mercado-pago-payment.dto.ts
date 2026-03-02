import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ConfirmMercadoPagoPaymentDto {
  @ApiProperty({ description: 'Mercado Pago payment id from success redirect' })
  @IsString()
  @IsNotEmpty()
  paymentId: string;

  @ApiProperty({
    description: 'Optional external reference sent by Mercado Pago',
    required: false,
  })
  @IsOptional()
  @IsString()
  externalReference?: string;
}
