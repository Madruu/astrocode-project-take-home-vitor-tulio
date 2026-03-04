import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { combineLatest, map } from 'rxjs';

import { BookingService } from '../../../../core/services/booking.service';
import { AuthService } from '../../../auth/services/auth.service';

interface PaymentRow {
  id: string;
  clientName: string;
  serviceName: string;
  startAt: string;
  amount: number;
  paymentTransactionId?: string;
  paymentStatus: 'paid' | 'pending';
}

@Component({
  selector: 'app-provider-payments',
  standalone: true,
  templateUrl: './provider-payments.component.html',
  styleUrl: './provider-payments.component.css',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    CurrencyPipe,
    DatePipe,
  ],
})
export class ProviderPaymentsComponent {
  private bookingService = inject(BookingService);
  private authService = inject(AuthService);
  private router = inject(Router);

  readonly user$ = this.authService.currentUser$;
  readonly searchTerm = signal('');
  readonly bookings$ = this.bookingService.getBookings$();

  readonly paymentRows$ = this.bookings$.pipe(
    map((bookings) =>
      bookings
        .filter((booking) => booking.status === 'confirmed')
        .map((booking) => ({
          id: booking.id,
          clientName: booking.clientName,
          serviceName: booking.serviceName,
          startAt: booking.startAt,
          amount: booking.amount,
          paymentTransactionId: booking.paymentTransactionId,
          paymentStatus: booking.paymentTransactionId ? 'paid' : 'pending',
        }))
    )
  );

  readonly filteredPayments$ = combineLatest([
    this.paymentRows$,
    toObservable(this.searchTerm),
  ]).pipe(
    map(([payments, query]) => {
      const normalizedQuery = query.trim().toLowerCase();
      if (!normalizedQuery) {
        return payments;
      }

      return payments.filter((payment) =>
        `${payment.serviceName} ${payment.clientName} ${payment.paymentTransactionId ?? ''}`
          .toLowerCase()
          .includes(normalizedQuery)
      );
    })
  );

  readonly summary$ = combineLatest([this.paymentRows$, this.bookings$]).pipe(
    map(([payments, allBookings]) => {
      const paidPayments = payments.filter((payment) => payment.paymentStatus === 'paid');
      const totalRevenue = paidPayments.reduce((total, payment) => total + payment.amount, 0);
      const pendingRevenue = payments
        .filter((payment) => payment.paymentStatus === 'pending')
        .reduce((total, payment) => total + payment.amount, 0);

      const initiatedBookings = allBookings.filter(
        (b) => b.status === 'confirmed' || b.status === 'cancelled'
      );
      const paidCountForConversion = initiatedBookings.filter(
        (b) => !!b.paymentTransactionId
      ).length;
      const conversionRate =
        initiatedBookings.length > 0
          ? Math.round((paidCountForConversion / initiatedBookings.length) * 100)
          : 0;

      return {
        totalRevenue,
        pendingRevenue,
        paidCount: paidPayments.length,
        totalCount: payments.length,
        conversionRate,
        initiatedCount: initiatedBookings.length,
      };
    })
  );

  onSearchChange(value: string): void {
    this.searchTerm.set(value);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['']);
  }
}
