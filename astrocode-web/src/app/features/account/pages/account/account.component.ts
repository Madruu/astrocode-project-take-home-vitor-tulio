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

  constructor() {
    this.handleMercadoPagoReturn();
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

  saveAccountChanges(): void {
    this.snackBar.open('Perfil atualizado com sucesso.', 'Fechar', { duration: 2600 });
  }

  changePassword(): void {
    this.snackBar.open('Alteracao de senha ainda sera integrada ao backend.', 'Fechar', {
      duration: 3200,
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
          .createMercadoPagoCheckout$(result.amount)
          .pipe(take(1))
          .subscribe({
            next: (checkout) => {
              const checkoutUrl = checkout.sandboxCheckoutUrl || checkout.checkoutUrl;
              if (!checkoutUrl) {
                this.snackBar.open('Nao foi possivel iniciar checkout no Mercado Pago.', 'Fechar', {
                  duration: 3200,
                });
                return;
              }
              this.snackBar.open('Redirecionando para o checkout do Mercado Pago...', 'Fechar', {
                duration: 2500,
              });
              globalThis.location.href = checkoutUrl;
            },
            error: (error: unknown) => {
              const message = error instanceof Error ? error.message : 'Erro ao iniciar checkout.';
              this.snackBar.open(message, 'Fechar', { duration: 3200 });
            },
          });
      });
  }

  private handleMercadoPagoReturn(): void {
    this.route.queryParamMap
      .pipe(take(1))
      .subscribe((params) => {
        if (params.get('source') !== 'mercado_pago') {
          return;
        }

        const paymentId = params.get('payment_id');
        const status = params.get('status')?.toLowerCase();
        const externalReference = params.get('external_reference') ?? undefined;

        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {},
          replaceUrl: true,
        });

        if (!paymentId || status !== 'approved') {
          this.snackBar.open('Pagamento nao aprovado. Seu saldo nao foi alterado.', 'Fechar', {
            duration: 3500,
          });
          return;
        }

        this.walletApiService
          .confirmMercadoPagoDeposit$(paymentId, externalReference)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.walletApiService.refresh();
              this.snackBar.open('Deposito confirmado com sucesso!', 'Fechar', { duration: 3000 });
            },
            error: (error: unknown) => {
              const message =
                error instanceof Error
                  ? error.message
                  : 'Pagamento aprovado, mas nao foi possivel confirmar no sistema.';
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
