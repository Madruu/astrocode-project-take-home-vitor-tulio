import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { TaskModule } from './task/task.module';
import { BookingModule } from './booking/booking.module';
import { PaymentModule } from './payment/payment.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(
      (process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL)
        ? {
            type: 'postgres',
            url: process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            autoLoadEntities: true,
            synchronize: true,
          }
        : {
            type: 'postgres',
            host: process.env.DB_HOST ?? 'localhost',
            port: parseInt(process.env.DB_PORT ?? '5432', 10),
            username: process.env.DB_USERNAME ?? 'postgres',
            password: process.env.DB_PASSWORD ?? 'joaojoao2003',
            database: process.env.DB_DATABASE ?? 'astrocode',
            autoLoadEntities: true,
            synchronize: true,
          },
    ),
    UserModule,
    AuthModule,
    TaskModule,
    BookingModule,
    PaymentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
