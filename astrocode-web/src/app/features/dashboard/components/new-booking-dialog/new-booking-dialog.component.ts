import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, Inject, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BehaviorSubject, catchError, combineLatest, debounceTime, map, merge, of, startWith, switchMap, take, timer } from 'rxjs';

import { Booking } from '../../../../core/services/booking.service';
import { BookingApiService } from '../../../../core/services/booking-api.service';
import { getTranslatedErrorMessage } from '../../../../core/utils/error-messages.pt';
import { ProviderTask, ProviderTaskApiService } from '../../../../core/services/provider-task-api.service';
import { ScheduleService } from '../../../../core/services/schedule.service';
import { WalletApiService } from '../../../../core/services/wallet-api.service';

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
  private walletApiService = inject(WalletApiService);
  private snackBar = inject(MatSnackBar);

  readonly form = inject(FormBuilder).nonNullable.group({
    clientName: ['', [Validators.required, Validators.minLength(3)]],
    serviceId: ['', Validators.required],
    date: ['', Validators.required],
    slot: ['', Validators.required],
    paymentMethod: ['wallet' as BookingPaymentMethod, Validators.required],
  });

  readonly serviceOptions$ = this.providerTaskApiService.getProviderTasks$().pipe(catchError(() => of([])));

  private slotsCache = new BehaviorSubject<SlotOption[]>([]);
  readonly availableSlots$ = this.slotsCache.asObservable();

  get hasCachedSlots(): boolean {
    return this.slotsCache.value.length > 0;
  }

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

    combineLatest([
      this.form.controls.date.valueChanges.pipe(
        startWith(this.form.controls.date.value),
        debounceTime(400),
      ),
      merge(
        this.form.controls.serviceId.valueChanges.pipe(startWith(this.form.controls.serviceId.value)),
        timer(100).pipe(map(() => this.form.getRawValue().serviceId)),
      ),
    ])
      .pipe(
        map(([dateValue, serviceIdValue]) => ({
          date: this.parseInputDate(dateValue),
          taskId: Number(serviceIdValue),
        })),
        switchMap(({ date, taskId }) => {
          if (!date || !Number.isInteger(taskId) || taskId <= 0) {
            return of(null);
          }
          return this.scheduleService.getAvailableSlots$(taskId, date).pipe(
            map((slots) =>
              slots.map((slotIso) => ({
                iso: slotIso,
                label: this.datePipe.transform(slotIso, 'HH:mm') ?? '',
              }))
            ),
            catchError(() => of([])),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((slots) => {
        if (slots !== null) {
          this.slotsCache.next(slots);
        }
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
      this.redirectDirectPaymentToPayPal(parsedTaskId, parsedUserId, raw.slot);
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
      : 'Pagamento direto via checkout do PayPal.';
  }

  get submitLabel(): string {
    if (this.loading) {
      return 'Processando...';
    }
    return this.form.controls.paymentMethod.value === 'direct'
      ? 'Ir para PayPal'
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
          const message = getTranslatedErrorMessage(error);
          this.snackBar.open(message, 'Fechar', { duration: 3500 });
        },
      });
  }

  private redirectDirectPaymentToPayPal(
    taskId: number,
    userId: number,
    scheduledDate: string
  ): void {
    this.loading = true;
    this.providerTaskApiService
      .getProviderTasks$()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tasks) => {
          const task = tasks.find((item) => Number(item.id) === taskId);
          const amount = Number(task?.price ?? 0);
          if (!Number.isFinite(amount) || amount <= 0) {
            this.loading = false;
            this.snackBar.open('Servico invalido para checkout no PayPal.', 'Fechar', {
              duration: 3500,
            });
            return;
          }
          if (!scheduledDate || scheduledDate.trim().length === 0) {
            this.loading = false;
            this.snackBar.open('Selecione data e horario antes de pagar.', 'Fechar', {
              duration: 3500,
            });
            return;
          }

          this.walletApiService
            .createPayPalCheckout$(amount, 'external_payment', {
              taskId,
              userId,
              scheduledDate,
            })
            .pipe(take(1), takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (checkout) => {
                this.loading = false;
                if (!checkout.checkoutUrl) {
                  this.snackBar.open('Nao foi possivel iniciar checkout no PayPal.', 'Fechar', {
                    duration: 3500,
                  });
                  return;
                }
                this.snackBar.open('Redirecionando para o PayPal...', 'Fechar', {
                  duration: 2200,
                });
                globalThis.location.href = checkout.checkoutUrl;
              },
              error: (error: unknown) => {
                this.loading = false;
                const message = getTranslatedErrorMessage(error);
                this.snackBar.open(message, 'Fechar', { duration: 3500 });
              },
            });
        },
        error: () => {
          this.loading = false;
          this.snackBar.open('Nao foi possivel carregar o servico selecionado.', 'Fechar', {
            duration: 3500,
          });
        },
      });
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
    if (year < 2000 || year > 2100) {
      return null;
    }

    const date = new Date();
    date.setFullYear(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return date;
  }

}
