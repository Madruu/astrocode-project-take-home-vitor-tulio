import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BookingService } from 'src/app/core/services/booking.service';
import { map } from 'rxjs/operators';
import { LoadingService } from 'src/app/core/services/loading.service';
import { catchError, combineLatest, filter, Observable, of, take } from 'rxjs';
import { AuthService } from 'src/app/features/auth/services/auth.service';
import { Booking } from 'src/app/core/services/booking.service';
import { NewBookingDialogComponent } from 'src/app/features/dashboard/components/new-booking-dialog/new-booking-dialog.component';
import { ProviderTaskApiService } from 'src/app/core/services/provider-task-api.service';
import { getTranslatedErrorMessage } from 'src/app/core/utils/error-messages.pt';

interface ServiceItem {
  id: string;
  title: string;
  duration: string;
  price: string;
}

@Component({
  selector: 'app-services',
  standalone: true,
  templateUrl: './services.component.html',
  styleUrl: './services.component.css',
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatIconModule,
    MatListModule,
    MatSnackBarModule,
  ],
})
export class ServicesComponent {
  private authService = inject(AuthService);
  private bookingService = inject(BookingService);
  private providerTaskApiService = inject(ProviderTaskApiService);
  private loadingService = inject(LoadingService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  readonly user$ = this.authService.currentUser$;
  readonly bookings$ = this.bookingService.getBookings$();

  readonly services$: Observable<ServiceItem[]> = this.providerTaskApiService.getProviderTasks$().pipe(
    map((services) =>
      services.map((service) => ({
        id: service.id,
        title: service.name,
        duration: `${service.durationMinutes} min`,
        price: `R$ ${service.price.toFixed(2)}`,
      }))
    ),
    map((services) => services.sort((a, b) => a.title.localeCompare(b.title))),
    catchError((error: unknown) => {
      const message = getTranslatedErrorMessage(error);
      this.snackBar.open(message, 'Fechar', { duration: 3000 });
      return of([]);
    })
  );
  readonly loading$ = this.loadingService.isLoading$;

  openBookingDialog(service: ServiceItem): void {
    combineLatest([this.user$, this.bookings$])
      .pipe(
        take(1),
        filter((result): result is [NonNullable<(typeof result)[0]>, Booking[]] => !!result[0])
      )
      .subscribe(([user, bookings]) => {
        const dialogRef = this.dialog.open(NewBookingDialogComponent, {
          width: '760px',
          data: {
            userId: user.id,
            bookings,
            preselectedServiceId: service.id,
            preselectedServiceLabel: `${service.title} - ${service.duration} - ${service.price}`,
          },
        });

        dialogRef
          .afterClosed()
          .pipe(filter((result) => !!result), take(1))
          .subscribe(() => {
            this.snackBar.open('Agendamento criado com sucesso.', 'Fechar', { duration: 2500 });
          });
      });
  }
}
