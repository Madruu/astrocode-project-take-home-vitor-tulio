import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ConfirmPayPalPaymentDto {
  @ApiProperty({ description: 'PayPal order id from success redirect' })
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({
    description: 'Optional external reference sent by PayPal custom_id',
    required: false,
  })
  @IsOptional()
  @IsString()
  externalReference?: string;
}
