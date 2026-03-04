import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, finalize, takeUntil } from 'rxjs';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {MatRadioModule} from '@angular/material/radio';
import { AuthService } from '../../services/auth.service';
import { getTranslatedErrorMessage } from '../../../../core/utils/error-messages.pt';

@Component({
  selector: 'app-signup',
  standalone: true,
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.css'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatRadioModule,
  ],
})
export class SignupComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  loading = signal(false);
  errorMessage = signal<string | null>(null);

  signupForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required, Validators.minLength(6)]],

    accountType: ['USER', [Validators.required]],
    cnpj: [null as string | null],
  });

  ngOnInit(): void {
    this.signupForm.controls.accountType.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((accountType) => {
      const cnpjControl = this.signupForm.controls.cnpj;
      if (accountType === 'PROVIDER') {
        cnpjControl.setValidators([
          Validators.required,
          Validators.minLength(14),
          Validators.maxLength(14),
          Validators.pattern(/^\d{14}$/),
        ]);
      } else {
        cnpjControl.clearValidators();
        cnpjControl.setValue(null);
      }
      cnpjControl.updateValueAndValidity();
    });
  }

  onSubmit() {
    this.signupForm.markAllAsTouched();
    if (this.signupForm.invalid) {
      this.errorMessage.set('Preencha os campos obrigatórios corretamente.');
      return;
    }
    if (this.signupForm.value.password !== this.signupForm.value.confirmPassword) {
      this.errorMessage.set('As senhas não coincidem.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    this.authService
      .signup(this.signupForm.getRawValue() as any)
      .pipe(finalize(() => this.loading.set(false)), takeUntil(this.destroy$))
      .subscribe({
        next: () => this.router.navigate(['/login']),
        error: (err: unknown) => this.errorMessage.set(getTranslatedErrorMessage(err)),
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
