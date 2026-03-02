import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, Inject, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

export interface DirectCardPaymentDialogData {
  amount: number;
  serviceLabel?: string;
}

export interface DirectCardPaymentDialogResult {
  cardNumber: string;
  cardHolder: string;
  cardExpiry: string;
  cardCvv: string;
}

@Component({
  selector: 'app-direct-card-payment-dialog',
  standalone: true,
  templateUrl: './direct-card-payment-dialog.component.html',
  styleUrl: './direct-card-payment-dialog.component.css',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    CurrencyPipe,
  ],
})
export class DirectCardPaymentDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<DirectCardPaymentDialogComponent>);

  readonly form = this.fb.nonNullable.group({
    cardNumber: ['', [Validators.required, Validators.minLength(13)]],
    cardHolder: ['', [Validators.required, Validators.minLength(3)]],
    cardExpiry: ['', [Validators.required, Validators.pattern(/^(0[1-9]|1[0-2])\/\d{2}$/)]],
    cardCvv: ['', [Validators.required, Validators.pattern(/^\d{3,4}$/)]],
  });

  constructor(@Inject(MAT_DIALOG_DATA) readonly data: DirectCardPaymentDialogData) {}

  buy(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.dialogRef.close(this.form.getRawValue());
  }
}
