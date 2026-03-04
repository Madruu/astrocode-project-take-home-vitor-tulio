import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, map, tap, throwError, timeout } from 'rxjs';
import { buildApiUrl } from '../../../core/config/api.config';
import { getTranslatedErrorMessage } from '../../../core/utils/error-messages.pt';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  accountType?: 'USER' | 'PROVIDER';
  password: string;
}

interface LoginResponse {
  userId: number | string;
  user: string;
  email?: string;
  token: string;
  accountType: 'USER' | 'PROVIDER';
  password: string;
}

interface SignupResponse {
  id: number | string;
  name: string;
  email: string;
  accountType?: 'USER' | 'PROVIDER';
}

interface SignupPayload {
  email: string;
  password: string;
  accountType: 'USER' | 'PROVIDER';
  cnpj?: string | null;
}

interface UpdateProfilePayload {
  name?: string;
  password?: string;
}

interface UpdateProfileResponse {
  id: number | string;
  name: string;
  email: string;
  accountType?: 'USER' | 'PROVIDER';
  password: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  private readonly tokenKey = 'token';
  private readonly userKey = 'auth_user';
  private currentUserSubject = new BehaviorSubject<AuthUser | null>(this.readUserFromStorage());

  readonly currentUser$ = this.currentUserSubject.asObservable();

  login(credentials: { email: string; password: string }): Observable<AuthUser> {
    return this.http
      .post<LoginResponse>(buildApiUrl('/auth/signin'), credentials)
      .pipe(
        timeout(10000),
        catchError((error: unknown) => {
          if ((error as { name?: string })?.name === 'TimeoutError') {
            return throwError(() => new Error('Tempo de resposta excedido ao autenticar.'));
          }

          if (error instanceof HttpErrorResponse && error.status !== 0) {
            const message = getTranslatedErrorMessage(error);
            return throwError(() => new Error(message));
          }
          return throwError(() => new Error('Não foi possível autenticar com o servidor.'));
        }),
        tap((response) => {
          const user = this.toAuthUser(response, credentials.email);
          localStorage.setItem(this.tokenKey, response.token);
          localStorage.setItem(this.userKey, JSON.stringify(user));
          this.currentUserSubject.next(user);
        }),
        map((response) => this.toAuthUser(response, credentials.email))
      );
  }

  signup(credentials: SignupPayload): Observable<AuthUser> {
    return this.http
      .post<SignupResponse>(buildApiUrl('/user'), {
        name: credentials.email.split('@')[0] || 'Novo Usuario',
        email: credentials.email,
        password: credentials.password,
        confirmPassword: credentials.password,
        accountType: credentials.accountType,
        cnpj: credentials.cnpj,
      })
      .pipe(
        catchError((err: unknown) => {
          const message = getTranslatedErrorMessage(err);
          return throwError(() => new Error(message));
        }),
        map((response) => ({
          id: String(response.id),
          name: response.name,
          email: response.email,
          accountType: response.accountType ?? credentials.accountType,
          password: credentials.password,
        }))
      );
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.currentUserSubject.next(null);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isAuthenticated$(): Observable<boolean> {
    return this.currentUser$.pipe(map((user) => !!user));
  }

  updateProfile(
    userId: string | number,
    payload: UpdateProfilePayload
  ): Observable<AuthUser> {
    return this.http
      .put<UpdateProfileResponse>(buildApiUrl(`/user/${userId}`), payload)
      .pipe(
        map((response) => ({
          id: String(response.id),
          name: response.name ?? this.currentUserSubject.value?.name ?? '',
          email: response.email ?? this.currentUserSubject.value?.email ?? '',
          accountType: response.accountType ?? this.currentUserSubject.value?.accountType,
          password: response.password ?? this.currentUserSubject.value?.password
        })),
        tap((updatedUser) => {
          localStorage.setItem(this.userKey, JSON.stringify(updatedUser));
          this.currentUserSubject.next(updatedUser);
        })
      );
  }

  private readUserFromStorage(): AuthUser | null {
    const userRaw = localStorage.getItem(this.userKey);
    if (!userRaw) {
      return null;
    }

    try {
      return JSON.parse(userRaw) as AuthUser;
    } catch {
      localStorage.removeItem(this.userKey);
      return null;
    }
  }

  private toAuthUser(response: LoginResponse, email: string): AuthUser {
    const tokenUserId = this.extractUserIdFromToken(response.token);
    const resolvedUserId =
      response.userId !== undefined && response.userId !== null
        ? String(response.userId)
        : tokenUserId !== null
          ? String(tokenUserId)
          : email;

    return {
      id: resolvedUserId,
      name: response.user,
      email: response.email ?? email,
      accountType: response.accountType,
      password: response.password ?? '',
    };
  }

  private extractUserIdFromToken(token: string): number | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const payloadJson = atob(parts[1]);
      const payload = JSON.parse(payloadJson) as { sub?: number | string };
      const parsedSub = Number(payload.sub);
      return Number.isInteger(parsedSub) ? parsedSub : null;
    } catch {
      return null;
    }
  }
}
