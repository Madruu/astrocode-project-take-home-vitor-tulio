import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, Inject, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { catchError, map, of, startWith, switchMap, take } from 'rxjs';

import { Booking } from '../../../../core/services/booking.service';
import { ApiBooking, BookingApiService } from '../../../../core/services/booking-api.service';
import { ProviderTask, ProviderTaskApiService } from '../../../../core/services/provider-task-api.service';
import { ScheduleService } from '../../../../core/services/schedule.service';
import {
  DirectCardPaymentDialogComponent,
  DirectCardPaymentDialogResult,
} from '../direct-card-payment-dialog/direct-card-payment-dialog.component';

export interface NewBookingDialogData {
  userId: string;
  bookings: Booking[];
  preselectedServiceId?: string;
  preselectedServiceLabel?: string;
}

interface SlotOption {
  iso: string;
  label: string;
}

type BookingPaymentMethod = 'wallet' | 'direct';

@Component({
  selector: 'app-new-booking-dialog',
  standalone: true,
  templateUrl: './new-booking-dialog.component.html',
  styleUrl: './new-booking-dialog.component.css',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  providers: [DatePipe, CurrencyPipe],
})
export class NewBookingDialogComponent {
  private destroyRef = inject(DestroyRef);
  private bookingApiService = inject(BookingApiService);
  private providerTaskApiService = inject(ProviderTaskApiService);
  private scheduleService = inject(ScheduleService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  readonly form = inject(FormBuilder).nonNullable.group({
    clientName: ['', [Validators.required, Validators.minLength(3)]],
    serviceId: ['', Validators.required],
    date: ['', Validators.required],
    slot: ['', Validators.required],
    paymentMethod: ['wallet' as BookingPaymentMethod, Validators.required],
  });

  readonly serviceOptions$ = this.providerTaskApiService.getProviderTasks$().pipe(catchError(() => of([])));
  readonly availableSlots$ = this.form.controls.date.valueChanges.pipe(
    startWith(this.form.controls.date.value),
    map((dateValue) => this.parseInputDate(dateValue)),
    switchMap((date) => {
      if (!date) {
        return of([] as SlotOption[]);
      }

      const fallbackBookedSlots = this.getBookedSlotsFromUi(date, this.data.bookings);

      return this.bookingApiService.getBookings$().pipe(
        map((bookings) => this.getBookedSlotsFromApi(date, bookings)),
        map((bookedSlots) => (bookedSlots.length > 0 ? bookedSlots : fallbackBookedSlots)),
        catchError(() => of(fallbackBookedSlots)),
        switchMap((bookedSlots) => this.scheduleService.getAvailableSlots$(date, bookedSlots)),
        map((slots) =>
          slots.map((slotIso) => ({
            iso: slotIso,
            label: this.datePipe.transform(slotIso, 'HH:mm') ?? '',
          }))
        ),
        catchError(() => of([]))
      );
    })
  );

  loading = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) readonly data: NewBookingDialogData,
    private dialogRef: MatDialogRef<NewBookingDialogComponent>,
    private datePipe: DatePipe
  ) {
    if (data.preselectedServiceId) {
      this.form.controls.serviceId.setValue(data.preselectedServiceId);
      this.form.controls.serviceId.disable();
    }

    this.form.controls.date.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.form.controls.slot.reset('');
    });
  }

  displayServiceLabel(service: ProviderTask): string {
    const duration = `${service.durationMinutes} min`;
    const price = this.currencyPipe.transform(service.price, 'BRL', 'symbol', '1.2-2') ?? 'R$ 0,00';
    return `${service.name} - ${duration} - ${price}`;
  }

  submit(): void {
    if (this.form.invalid || this.loading) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const parsedTaskId = Number(raw.serviceId);
    const parsedUserId = Number(this.data.userId);
    if (!Number.isInteger(parsedTaskId) || !Number.isInteger(parsedUserId)) {
      this.loading = false;
      this.snackBar.open(
        'Sessao invalida para agendamento. Faca logout e login novamente.',
        'Fechar',
        { duration: 4000 }
      );
      return;
    }

    if (raw.paymentMethod === 'direct') {
      this.openDirectPaymentDialog(parsedTaskId)
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe((cardPayment) => {
          if (!cardPayment) {
            return;
          }
          this.createBookingRequest(parsedTaskId, parsedUserId, raw.slot, raw.paymentMethod);
        });
      return;
    }

    this.createBookingRequest(parsedTaskId, parsedUserId, raw.slot, raw.paymentMethod);
  }

  isPaymentMethodSelected(method: BookingPaymentMethod): boolean {
    return this.form.controls.paymentMethod.value === method;
  }

  setPaymentMethod(method: BookingPaymentMethod): void {
    this.form.controls.paymentMethod.setValue(method);
  }

  get paymentMethodLabel(): string {
    return this.form.controls.paymentMethod.value === 'wallet'
      ? 'Pagamento pela carteira do app (saldo).'
      : 'Pagamento direto no cartao de credito.';
  }

  get submitLabel(): string {
    if (this.loading) {
      return 'Processando...';
    }
    return this.form.controls.paymentMethod.value === 'direct'
      ? 'Comprar'
      : 'Confirmar e pagar';
  }

  private currencyPipe = inject(CurrencyPipe);

  private createBookingRequest(
    taskId: number,
    userId: number,
    scheduledDate: string,
    paymentMethod: BookingPaymentMethod
  ): void {
    this.loading = true;
    this.bookingApiService
      .createBooking$({
        taskId,
        userId,
        scheduledDate,
        paymentMethod,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading = false;
          this.dialogRef.close(true);
        },
        error: (error: unknown) => {
          this.loading = false;
          const message = error instanceof Error ? error.message : 'Nao foi possivel concluir o agendamento.';
          this.snackBar.open(message, 'Fechar', { duration: 3500 });
        },
      });
  }

  private openDirectPaymentDialog(taskId: number) {
    return this.providerTaskApiService.getProviderTasks$().pipe(
      take(1),
      map((tasks) => tasks.find((task) => Number(task.id) === taskId)),
      map((task) => {
        const dialogRef = this.dialog.open<
          DirectCardPaymentDialogComponent,
          { amount: number; serviceLabel?: string },
          DirectCardPaymentDialogResult | undefined
        >(DirectCardPaymentDialogComponent, {
          width: '460px',
          maxWidth: '95vw',
          autoFocus: false,
          data: {
            amount: Number(task?.price ?? 0),
            serviceLabel: task?.name,
          },
        });
        return dialogRef.afterClosed();
      }),
      switchMap((result$) => result$)
    );
  }

  private parseInputDate(value: string): Date | null {
    if (!value) {
      return null;
    }

    const [yearRaw, monthRaw, dayRaw] = value.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);

    if (!year || !month || !day) {
      return null;
    }

    const date = new Date();
    date.setFullYear(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private isSameDay(a: Date, b: Date): boolean {
    return (
      a.getDate() === b.getDate() &&
      a.getMonth() === b.getMonth() &&
      a.getFullYear() === b.getFullYear()
    );
  }

  private getBookedSlotsFromUi(date: Date, bookings: Booking[]): string[] {
    return bookings
      .filter((booking) => booking.status !== 'cancelled')
      .filter((booking) => this.isSameDay(new Date(booking.startAt), date))
      .map((booking) => booking.startAt);
  }

  private getBookedSlotsFromApi(date: Date, bookings: ApiBooking[]): string[] {
    return bookings
      .filter((booking) => booking.status?.toLowerCase() !== 'cancelled')
      .filter((booking) => this.isSameDay(new Date(booking.scheduledDate), date))
      .map((booking) => booking.scheduledDate);
  }
}
