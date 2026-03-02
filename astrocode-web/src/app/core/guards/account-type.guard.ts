import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, map, take } from 'rxjs';

import { AuthService } from '../../features/auth/services/auth.service';

const PROVIDER_REDIRECTS: Record<string, string> = {
  '/dashboard': '/provider-dashboard',
  '/services': '/provider-services',
};

export const userOnlyGuard: CanActivateFn = (_, state): Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.currentUser$.pipe(
    take(1),
    map((user) => {
      if (!user) {
        return router.createUrlTree(['/login']);
      }

      if (user.accountType === 'PROVIDER') {
        return router.createUrlTree([PROVIDER_REDIRECTS[state.url] ?? '/provider-dashboard']);
      }

      return true;
    })
  );
};

export const providerOnlyGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.currentUser$.pipe(
    take(1),
    map((user) => {
      if (!user) {
        return router.createUrlTree(['/login']);
      }

      return user.accountType === 'PROVIDER' ? true : router.createUrlTree(['/dashboard']);
    })
  );
};
