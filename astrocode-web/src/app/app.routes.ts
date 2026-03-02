import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { providerOnlyGuard, userOnlyGuard } from './core/guards/account-type.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/landing/pages/landing/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/pages/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'signup',
    loadComponent: () =>
      import('./features/auth/pages/signup/signup.component').then(m => m.SignupComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard, userOnlyGuard],
    loadComponent: () =>
      import('./features/dashboard/pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'provider-dashboard',
    canActivate: [authGuard, providerOnlyGuard],
    loadComponent: () =>
      import('./features/dashboard/pages/provider-dashboard/provider-dashboard.component').then(
        (m) => m.ProviderDashboardComponent
      ),
  },
  {
    path: 'services',
    canActivate: [authGuard, userOnlyGuard],
    loadComponent: () =>
      import('./features/services/pages/services/services.component').then((m) => m.ServicesComponent),
  },
  {
    path: 'provider-services',
    canActivate: [authGuard, providerOnlyGuard],
    loadComponent: () =>
      import('./features/services/pages/provider-services/provider-services.component').then(
        (m) => m.ProviderServicesComponent
      ),
  },
  {
    path: 'provider-payments',
    canActivate: [authGuard, providerOnlyGuard],
    loadComponent: () =>
      import('./features/payments/pages/provider-payments/provider-payments.component').then(
        (m) => m.ProviderPaymentsComponent
      ),
  },
  {
    path: 'schedule',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/schedule/pages/schedule/schedule.component').then((m) => m.ScheduleComponent),
  },
  {
    path: 'calendar',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/calendar/pages/calendar/calendar.component').then((m) => m.CalendarComponent),
  },
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/account/pages/account/account.component').then((m) => m.AccountComponent),
  },
  {
    path: 'account-transactions',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/account/pages/account-transactions/account-transactions.component').then(
        (m) => m.AccountTransactionsComponent
      ),
  },
  { path: '**', redirectTo: '' },
];
