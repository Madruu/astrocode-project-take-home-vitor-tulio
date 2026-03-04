import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { EMPTY, Subject, catchError, combineLatest, filter, map, switchMap, take, takeUntil } from 'rxjs';

import { AuthService } from '../../../auth/services/auth.service';
import { getTranslatedErrorMessage } from '../../../../core/utils/error-messages.pt';
import { Booking, BookingService } from '../../../../core/services/booking.service';
import { LoadingService } from '../../../../core/services/loading.service';
import { NewBookingDialogComponent } from '../../components/new-booking-dialog/new-booking-dialog.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressBarModule,
    MatDialogModule,
    DatePipe,
    CurrencyPipe,
    RouterLink,
  ],
})
export class DashboardComponent implements OnDestroy {
  private authService = inject(AuthService);
  private bookingService = inject(BookingService);
  private loadingService = inject(LoadingService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  private destroy$ = new Subject<void>();

  readonly loading$ = this.loadingService.isLoading$;
  readonly user$ = this.authService.currentUser$;
  readonly summary$ = this.bookingService.getSummary$();
  readonly bookings$ = this.bookingService.getBookings$();
  readonly upcomingBookings$ = this.bookingService.getUpcomingBookings$();
  readonly servicesCount$ = this.bookingService.getServiceOptions$().pipe(map((services) => services.length));
  readonly upcomingCount$ = this.upcomingBookings$.pipe(map((bookings) => bookings.length));
  readonly nextBooking$ = this.upcomingBookings$.pipe(map((bookings) => bookings[0] ?? null));
  readonly pendingPayments$ = this.upcomingBookings$.pipe(
    map((bookings) =>
      bookings.filter((booking) => !booking.paymentTransactionId)
    ),
    map((unpaidBookings) => ({
      count: unpaidBookings.length,
      amount: unpaidBookings.reduce((total, booking) => total + booking.amount, 0),
    }))
  );
  readonly pendingCount$ = this.pendingPayments$.pipe(map((pending) => pending.count));

  logout(): void {
    this.authService.logout();
    this.router.navigate(['']);
  }

  openNewBooking(): void {
    combineLatest([this.user$, this.bookings$])
      .pipe(
        take(1),
        filter((result): result is [NonNullable<(typeof result)[0]>, Booking[]] => !!result[0]),
        takeUntil(this.destroy$)
      )
      .subscribe(([user, bookings]) => {
        const dialogRef = this.dialog.open(NewBookingDialogComponent, {
          width: '760px',
          data: {
            userId: user.id,
            bookings,
          },
        });

        dialogRef
          .afterClosed()
          .pipe(filter((result) => !!result), takeUntil(this.destroy$))
          .subscribe(() => {
            this.snackBar.open('Agenda atualizada com sucesso.', 'Fechar', { duration: 2500 });
          });
      });
  }

  cancelBooking(bookingId: string): void {
    this.user$
      .pipe(
        take(1),
        filter((user): user is NonNullable<typeof user> => !!user),
        switchMap((user) => this.bookingService.cancelBooking$(bookingId, user.id)),
        catchError((error: unknown) => {
          const message = getTranslatedErrorMessage(error);
          this.snackBar.open(message, 'Fechar', { duration: 3500 });
          return EMPTY;
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.snackBar.open('Agendamento cancelado.', 'Fechar', { duration: 2500 });
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
