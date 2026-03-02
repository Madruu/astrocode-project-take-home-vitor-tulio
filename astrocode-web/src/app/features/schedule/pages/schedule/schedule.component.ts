import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { EMPTY, catchError, filter, map, switchMap, take } from 'rxjs';

import { AuthService } from '../../../auth/services/auth.service';
import { Booking, BookingService } from '../../../../core/services/booking.service';
import { LoadingService } from '../../../../core/services/loading.service';
import { CancelBookingReasonDialogComponent } from '../../../../shared/components/cancel-booking-reason-dialog/cancel-booking-reason-dialog.component';

interface KanbanColumnVm {
  id: 'ativos' | 'concluidos' | 'cancelados';
  title: 'Ativos' | 'Concluídos' | 'Cancelados';
  bookings: Booking[];
  totalAmount: number;
  emptyMessage: string;
}

@Component({
  selector: 'app-schedule',
  standalone: true,
  templateUrl: './schedule.component.html',
  styleUrl: './schedule.component.css',
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    RouterModule,
  ],
})
export class ScheduleComponent {
  private authService = inject(AuthService);
  private bookingService = inject(BookingService);
  private loadingService = inject(LoadingService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  readonly loading$ = this.loadingService.isLoading$;
  readonly user$ = this.authService.currentUser$;
  readonly bookings$ = this.bookingService.getBookings$();

  readonly kanbanColumns$ = this.bookings$.pipe(map((bookings) => this.buildKanbanColumns(bookings)));

  readonly kanbanSummary$ = this.kanbanColumns$.pipe(
    map((columns) => ({
      activeCount: columns.find((column) => column.id === 'ativos')?.bookings.length ?? 0,
      concludedCount: columns.find((column) => column.id === 'concluidos')?.bookings.length ?? 0,
      cancelledCount: columns.find((column) => column.id === 'cancelados')?.bookings.length ?? 0,
      projectedRevenue: columns
        .filter((column) => column.id !== 'cancelados')
        .reduce((acc, column) => acc + column.totalAmount, 0),
    }))
  );

  logout(): void {
    this.authService.logout();
    this.router.navigate(['']);
  }

  cancelBooking(bookingId: string): void {
    const dialogRef = this.dialog.open(CancelBookingReasonDialogComponent, { width: '520px' });

    dialogRef
      .afterClosed()
      .pipe(
        filter((reason): reason is string => !!reason && reason.trim().length >= 3),
        map((reason) => reason.trim()),
        take(1),
        switchMap((reason) =>
          this.user$.pipe(
            take(1),
            filter((user): user is NonNullable<typeof user> => !!user),
            switchMap((user) => this.bookingService.cancelBooking$(bookingId, user.id, reason))
          )
        ),
        take(1),
        catchError((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Falha ao cancelar o agendamento.';
          this.snackBar.open(message, 'Fechar', { duration: 3500 });
          return EMPTY;
        })
      )
      .subscribe(() => {
        this.snackBar.open('Agendamento cancelado.', 'Fechar', { duration: 2500 });
      });
  }

  canCancel(booking: Booking): boolean {
    return (
      (booking.status === 'confirmed' || booking.status === 'booked') &&
      new Date(booking.startAt).getTime() > Date.now()
    );
  }

  private buildKanbanColumns(bookings: Booking[]): KanbanColumnVm[] {
    const now = Date.now();

    const ativos = bookings
      .filter(
        (booking) =>
          (booking.status === 'confirmed' || booking.status === 'booked') &&
          new Date(booking.startAt).getTime() >= now
      )
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

    const concluidos = bookings
      .filter(
        (booking) =>
          (booking.status === 'confirmed' || booking.status === 'booked') &&
          new Date(booking.startAt).getTime() < now
      )
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());

    const cancelados = bookings
      .filter((booking) => booking.status === 'cancelled')
      .sort((a, b) => {
        const aRef = a.cancelledAt ?? a.startAt;
        const bRef = b.cancelledAt ?? b.startAt;
        return new Date(bRef).getTime() - new Date(aRef).getTime();
      });

    return [
      this.createColumn('ativos', 'Ativos', ativos, 'Nenhum agendamento ativo.'),
      this.createColumn('concluidos', 'Concluídos', concluidos, 'Nenhum agendamento concluído.'),
      this.createColumn('cancelados', 'Cancelados', cancelados, 'Nenhum agendamento cancelado.'),
    ];
  }

  private createColumn(
    id: KanbanColumnVm['id'],
    title: KanbanColumnVm['title'],
    bookings: Booking[],
    emptyMessage: string
  ): KanbanColumnVm {
    return {
      id,
      title,
      bookings,
      totalAmount: bookings.reduce((acc, booking) => acc + booking.amount, 0),
      emptyMessage,
    };
  }
}
