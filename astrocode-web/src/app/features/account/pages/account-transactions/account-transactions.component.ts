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

import {
  WalletApiService,
  WalletTransaction,
} from '../../../../core/services/wallet-api.service';
import { AuthService } from '../../../auth/services/auth.service';

type TransactionType = 'payment' | 'refund' | 'deposit';
type TransactionStatus = 'completed' | 'pending' | 'failed';

interface WalletTransactionRow {
  id: string;
  description: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  createdAt: string;
  reference: string;
}

@Component({
  selector: 'app-account-transactions',
  standalone: true,
  templateUrl: './account-transactions.component.html',
  styleUrl: './account-transactions.component.css',
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
export class AccountTransactionsComponent {
  private authService = inject(AuthService);
  private walletApiService = inject(WalletApiService);
  private router = inject(Router);

  readonly user$ = this.authService.currentUser$;
  readonly searchTerm = signal('');
  readonly transactions$ = this.walletApiService.getTransactions$().pipe(
    map((transactions) => transactions.map((transaction) => this.toUiTransaction(transaction)))
  );

  readonly filteredTransactions$ = combineLatest([this.transactions$, toObservable(this.searchTerm)]).pipe(
    map(([transactions, query]) => {
      const normalizedQuery = query.trim().toLowerCase();
      if (!normalizedQuery) {
        return transactions;
      }

      return transactions.filter((transaction) =>
        `${transaction.description} ${transaction.reference}`
          .toLowerCase()
          .includes(normalizedQuery)
      );
    })
  );

  readonly summary$ = this.transactions$.pipe(
    map((transactions) => {
      const depositTotal = transactions
        .filter((transaction) => transaction.type === 'deposit')
        .reduce((total, transaction) => total + transaction.amount, 0);
      const paymentTotal = transactions
        .filter((transaction) => transaction.type === 'payment')
        .reduce((total, transaction) => total + transaction.amount, 0);
      const refundTotal = transactions
        .filter((transaction) => transaction.type === 'refund')
        .reduce((total, transaction) => total + transaction.amount, 0);
      const pendingCount = transactions.filter((transaction) => transaction.status === 'pending').length;

      return {
        depositTotal,
        paymentTotal,
        refundTotal,
        netSpent: paymentTotal - refundTotal,
        pendingCount,
      };
    })
  );

  onSearchChange(value: string): void {
    this.searchTerm.set(value);
  }

  private toUiTransaction(transaction: WalletTransaction): WalletTransactionRow {
    const type: TransactionType =
      transaction.type === 'DEPOSIT'
        ? 'deposit'
        : transaction.type === 'BOOKING_REFUND'
          ? 'refund'
          : 'payment';

    return {
      id: String(transaction.id),
      description: transaction.description ?? this.getDefaultDescription(transaction.type),
      type,
      status:
        transaction.status === 'PENDING'
          ? 'pending'
          : transaction.status === 'FAILED'
            ? 'failed'
            : 'completed',
      amount: Number(transaction.amount),
      createdAt: transaction.createdAt,
      reference: transaction.reference ?? `TX-${transaction.id}`,
    };
  }

  private getDefaultDescription(type: WalletTransaction['type']): string {
    if (type === 'DEPOSIT') {
      return 'Deposito na carteira';
    }
    if (type === 'BOOKING_REFUND') {
      return 'Estorno de agendamento';
    }
    return 'Pagamento de agendamento';
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['']);
  }
}
