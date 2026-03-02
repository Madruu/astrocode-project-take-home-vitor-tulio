import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../../auth/services/auth.service';
import { Booking, BookingService } from '../../../../core/services/booking.service';

interface CalendarCell {
  date: Date | null;
  day: number | null;
  isToday: boolean;
  hasBookings: boolean;
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.css',
  imports: [CommonModule, RouterModule, MatButtonModule, MatCardModule, MatIconModule],
})
export class CalendarComponent {
  private authService = inject(AuthService);
  private bookingService = inject(BookingService);
  private router = inject(Router);

  readonly user$ = this.authService.currentUser$;
  readonly weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

  private bookings = toSignal(this.bookingService.getBookings$(), { initialValue: [] as Booking[] });
  readonly viewDate = signal(this.startOfMonth(new Date()));
  readonly selectedDate = signal<Date | null>(null);

  readonly monthLabel = computed(() => {
    return this.viewDate().toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
  });

  readonly daysWithBookings = computed(() => {
    const currentMonth = this.viewDate().getMonth();
    const currentYear = this.viewDate().getFullYear();
    const daySet = new Set<number>();

    for (const booking of this.bookings() ?? []) {
      if (booking.status !== 'confirmed') {
        continue;
      }
      const bookingDate = new Date(booking.startAt);
      if (bookingDate.getMonth() === currentMonth && bookingDate.getFullYear() === currentYear) {
        daySet.add(bookingDate.getDate());
      }
    }

    return daySet;
  });

  readonly calendarCells = computed<CalendarCell[]>(() => {
    const monthDate = this.viewDate();
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const cells: CalendarCell[] = [];

    for (let i = 0; i < firstDay; i++) {
      cells.push({ date: null, day: null, isToday: false, hasBookings: false });
    }

    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month, day);
      const isToday =
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();

      cells.push({
        date,
        day,
        isToday,
        hasBookings: this.daysWithBookings().has(day),
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push({ date: null, day: null, isToday: false, hasBookings: false });
    }

    return cells;
  });

  readonly selectedDateBookings = computed(() => {
    const selectedDate = this.selectedDate();
    if (!selectedDate) {
      return [];
    }

    return (this.bookings() ?? [])
      .filter((booking) => booking.status === 'confirmed')
      .filter((booking) => this.isSameDay(new Date(booking.startAt), selectedDate))
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  });

  readonly monthSummary = computed(() => {
    const currentMonth = this.viewDate().getMonth();
    const currentYear = this.viewDate().getFullYear();
    const monthBookings = (this.bookings() ?? []).filter((booking) => {
      const bookingDate = new Date(booking.startAt);
      return bookingDate.getMonth() === currentMonth && bookingDate.getFullYear() === currentYear;
    });

    const confirmed = monthBookings.filter((booking) => booking.status === 'confirmed');
    const cancelled = monthBookings.filter((booking) => booking.status === 'cancelled');
    const paid = confirmed.filter((booking) => !!booking.paymentTransactionId);
    const totalSpent = confirmed.reduce((acc, booking) => acc + booking.amount, 0);

    return {
      confirmedCount: confirmed.length,
      paidCount: paid.length,
      cancelledCount: cancelled.length,
      totalSpent,
    };
  });

  logout(): void {
    this.authService.logout();
    this.router.navigate(['']);
  }

  goToPreviousMonth(): void {
    const current = this.viewDate();
    this.viewDate.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
    this.selectedDate.set(null);
  }

  goToNextMonth(): void {
    const current = this.viewDate();
    this.viewDate.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
    this.selectedDate.set(null);
  }

  goToCurrentMonth(): void {
    this.viewDate.set(this.startOfMonth(new Date()));
  }

  selectDate(date: Date | null): void {
    if (!date) {
      return;
    }
    this.selectedDate.set(date);
  }

  isSelected(date: Date | null): boolean {
    const selected = this.selectedDate();
    return !!date && !!selected && this.isSameDay(date, selected);
  }

  formatSelectedDate(date: Date): string {
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  private startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }
}
