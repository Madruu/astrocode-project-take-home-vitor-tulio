import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { map, Observable } from 'rxjs';
import { take } from 'rxjs';

import { AuthService } from '../../../auth/services/auth.service';
import { getTranslatedErrorMessage } from '../../../../core/utils/error-messages.pt';
import {
  WalletApiService,
  WalletSummary,
  WalletTransaction,
} from '../../../../core/services/wallet-api.service';
import {
  AddBalanceDialogComponent,
  AddBalanceDialogResult,
} from '../../components/add-balance-dialog/add-balance-dialog.component';

@Component({
  selector: 'app-account',
  standalone: true,
  templateUrl: './account.component.html',
  styleUrl: './account.component.css',
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    RouterLink,
  ],
})
export class AccountComponent {
  private authService = inject(AuthService);
  private walletApiService = inject(WalletApiService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly user$ = this.authService.currentUser$;
  readonly walletSummary$: Observable<WalletSummary> = this.walletApiService.getWalletSummary$();
  readonly recentTransactions$: Observable<WalletTransaction[]> = this.walletApiService
    .getTransactions$()
    .pipe(map((transactions) => transactions.slice(0, 3)));
  isSavingProfile = false;
  isChangingPassword = false;

  constructor() {
    this.handlePayPalReturn();
  }

  getWalletBalance(summary: WalletSummary | null): number {
    return Number(summary?.balance ?? 0);
  }

  getTransactionAmountClass(type: WalletTransaction['type']): string {
    return type === 'BOOKING_CHARGE' ? 'amount-out' : 'amount-in';
  }

  getTransactionAmountPrefix(type: WalletTransaction['type']): string {
    return type === 'BOOKING_CHARGE' ? '-' : '+';
  }

  getTransactionDescription(transaction: WalletTransaction): string {
    if (transaction.description) {
      return transaction.description;
    }
    if (transaction.type === 'DEPOSIT') {
      return 'Adicao de saldo a carteira';
    }
    if (transaction.type === 'BOOKING_REFUND') {
      return 'Estorno de agendamento';
    }
    return 'Pagamento de agendamento';
  }

  saveAccountChanges(event: Event, name: string): void {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      this.snackBar.open('Informe um nome valido.', 'Fechar', { duration: 2600 });
      return;
    }

    this.user$.pipe(take(1)).subscribe((user) => {
      if (!user) {
        this.snackBar.open('Nao foi possivel identificar a conta atual.', 'Fechar', {
          duration: 3000,
        });
        return;
      }

      this.isSavingProfile = true;
      this.authService
        .updateProfile(user.id, { name: trimmedName })
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.isSavingProfile = false;
            this.snackBar.open('Perfil atualizado com sucesso.', 'Fechar', { duration: 2600 });
          },
          error: (error: unknown) => {
            this.isSavingProfile = false;
            const message = getTranslatedErrorMessage(error);
            this.snackBar.open(message, 'Fechar', { duration: 3200 });
          },
        });
    });
  }

  changePassword(event: Event, currentPassword: string, newPassword: string, confirmPassword: string): void {
    event.preventDefault();
    const trimmedCurrentPassword = currentPassword.trim();
    if (!trimmedCurrentPassword) {
      this.snackBar.open('Informe a senha atual.', 'Fechar', { duration: 2600 });
      return;
    }
    const trimmedNewPassword = newPassword.trim();
    if (!trimmedNewPassword) {
      this.snackBar.open('Informe a nova senha.', 'Fechar', { duration: 2600 });
      return;
    }
    if (trimmedNewPassword.length < 6) {
      this.snackBar.open('A nova senha deve ter no mínimo 6 caracteres.', 'Fechar', { duration: 2600 });
      return;
    }
    const trimmedConfirmPassword = confirmPassword.trim();
    if (!trimmedConfirmPassword) {
      this.snackBar.open('Informe a confirmação da nova senha.', 'Fechar', { duration: 2600 });
      return;
    }
    if (trimmedNewPassword !== trimmedConfirmPassword) {
      this.snackBar.open('As senhas não coincidem.', 'Fechar', { duration: 2600 });
      return;
    }
    if (trimmedNewPassword === trimmedCurrentPassword) {
      this.snackBar.open('Sua nova senha não pode ser igual à antiga.', 'Fechar', { duration: 2600 });
      return;
    }

    this.user$.pipe(take(1)).subscribe((user) => {
      if (!user) {
        this.snackBar.open('Nao foi possivel identificar a conta atual.', 'Fechar', {
          duration: 3000,
        });
        return;
      }

      this.isChangingPassword = true;
      this.authService
        .updateProfile(user.id, { password: trimmedNewPassword })
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.isChangingPassword = false;
            this.snackBar.open('Senha alterada com sucesso.', 'Fechar', { duration: 2600 });
          },
          error: (error: unknown) => {
            this.isChangingPassword = false;
            const message = getTranslatedErrorMessage(error);
            this.snackBar.open(message, 'Fechar', { duration: 3200 });
          },
        });
    });
  }

  depositToWallet(): void {
    const dialogRef = this.dialog.open<
      AddBalanceDialogComponent,
      undefined,
      AddBalanceDialogResult | undefined
    >(AddBalanceDialogComponent, {
      width: '500px',
      maxWidth: '95vw',
      autoFocus: false,
    });

    dialogRef
      .afterClosed()
      .pipe(take(1))
      .subscribe((result) => {
        if (!result) {
          return;
        }

        this.walletApiService
          .createPayPalCheckout$(result.amount)
          .pipe(take(1))
          .subscribe({
            next: (checkout) => {
              const checkoutUrl = checkout.checkoutUrl;
              if (!checkoutUrl) {
                this.snackBar.open('Nao foi possivel iniciar checkout no PayPal.', 'Fechar', {
                  duration: 3200,
                });
                return;
              }
              this.snackBar.open('Redirecionando para o checkout do PayPal...', 'Fechar', {
                duration: 2500,
              });
              globalThis.location.href = checkoutUrl;
            },
            error: (error: unknown) => {
              const message = getTranslatedErrorMessage(error);
              this.snackBar.open(message, 'Fechar', { duration: 3200 });
            },
          });
      });
  }

  private handlePayPalReturn(): void {
    this.route.queryParamMap
      .pipe(take(1))
      .subscribe((params) => {
        const source = params.get('source');
        if (source !== 'paypal' && source !== 'paypal_external') {
          return;
        }

        const orderId = params.get('token');
        const status = params.get('status')?.toLowerCase();
        const externalReference = params.get('external_reference') ?? undefined;

        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {},
          replaceUrl: true,
        });

        if (!orderId) {
          this.snackBar.open('Pagamento nao aprovado.', 'Fechar', {
            duration: 3500,
          });
          this.walletApiService.refresh();
          return;
        }

        this.walletApiService
          .confirmPayPalDeposit$(orderId, externalReference)
          .pipe(take(1))
          .subscribe({
            next: (transaction) => {
              this.walletApiService.refresh();
              if (transaction.status === 'COMPLETED') {
                const isBooking =
                  transaction.type === 'BOOKING_CHARGE';
                this.snackBar.open(
                  isBooking
                    ? 'Agendamento e pagamento confirmados com sucesso!'
                    : 'Deposito confirmado com sucesso!',
                  'Fechar',
                  { duration: 3000 }
                );
                return;
              }
              this.snackBar.open('Pagamento nao aprovado.', 'Fechar', {
                duration: 3500,
              });
            },
            error: (error: unknown) => {
              this.walletApiService.refresh();
              if (status && status !== 'approved') {
                this.snackBar.open('Pagamento nao aprovado. Seu saldo nao foi alterado.', 'Fechar', {
                  duration: 3500,
                });
                return;
              }
              const message = getTranslatedErrorMessage(error);
              this.snackBar.open(message, 'Fechar', { duration: 4000 });
            },
          });
      });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['']);
  }
}
