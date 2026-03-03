import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, switchMap, startWith, shareReplay } from 'rxjs';

import { buildApiUrl } from '../config/api.config';

export interface WalletTransaction {
  id: number;
  amount: number;
  currency: string;
  type: 'DEPOSIT' | 'BOOKING_CHARGE' | 'BOOKING_REFUND';
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  reference?: string | null;
  description?: string | null;
  createdAt: string;
}

export interface WalletSummary {
  balance: number;
  currency: string;
  totalDeposits: number;
  totalCharges: number;
  totalRefunds: number;
  pendingTransactions: number;
}

export interface PayPalCheckoutResponse {
  checkoutUrl: string;
  orderId: string;
  paymentReference: string;
}

export type PayPalCheckoutPurpose = 'wallet_deposit' | 'external_payment';

@Injectable({
  providedIn: 'root',
})
export class WalletApiService {
  private http = inject(HttpClient);
  private refreshTrigger$ = new Subject<void>();

  readonly walletSummary$ = this.refreshTrigger$.pipe(
    startWith(void 0),
    switchMap(() => this.http.get<WalletSummary>(buildApiUrl('/payment/wallet'))),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  readonly transactions$ = this.refreshTrigger$.pipe(
    startWith(void 0),
    switchMap(() => this.http.get<WalletTransaction[]>(buildApiUrl('/payment/list'))),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  getWalletSummary$(): Observable<WalletSummary> {
    return this.walletSummary$;
  }

  getTransactions$(): Observable<WalletTransaction[]> {
    return this.transactions$;
  }

  deposit$(amount: number): Observable<WalletTransaction> {
    return this.http
      .post<WalletTransaction>(buildApiUrl('/payment/create'), {
        amount,
        currency: 'BRL',
      });
  }

  createPayPalCheckout$(
    amount: number,
    purpose: PayPalCheckoutPurpose = 'wallet_deposit'
  ): Observable<PayPalCheckoutResponse> {
    return this.http.post<PayPalCheckoutResponse>(
      buildApiUrl('/payment/paypal/checkout'),
      {
        amount,
        currency: 'BRL',
        purpose,
      }
    );
  }

  confirmPayPalDeposit$(
    orderId: string,
    externalReference?: string
  ): Observable<WalletTransaction> {
    return this.http.post<WalletTransaction>(
      buildApiUrl('/payment/paypal/confirm'),
      {
        orderId,
        externalReference,
      }
    );
  }

  refresh(): void {
    this.refreshTrigger$.next();
  }
}
