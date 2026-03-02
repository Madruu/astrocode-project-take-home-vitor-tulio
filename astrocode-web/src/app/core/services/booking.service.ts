import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap, throwError } from 'rxjs';

import { ApiBooking, BookingApiService } from './booking-api.service';
import { ProviderTaskApiService } from './provider-task-api.service';

export interface ServiceOption {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
}

export type BookingStatus = 'booked' | 'confirmed' | 'cancelled';

export interface Booking {
  id: string;
  clientName: string;
  userId: string;
  serviceId: string;
  serviceName: string;
  startAt: string;
  amount: number;
  status: BookingStatus;
  cancelledAt?: string;
  paymentTransactionId?: string;
}

export interface DashboardSummary {
  totalBookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  totalRevenue: number;
}

export interface CreateBookingInput {
  clientName: string;
  userId: string;
  serviceId: string;
  startAt: string;
}

export interface SaveServiceOptionInput {
  name: string;
  durationMinutes: number;
  price: number;
}

@Injectable({
  providedIn: 'root',
})
export class BookingService {
  private bookingApiService = inject(BookingApiService);
  private providerTaskApiService = inject(ProviderTaskApiService);

  getServiceOptions$(): Observable<ServiceOption[]> {
    return this.providerTaskApiService.getProviderTasks$().pipe(
      map((services) =>
        services.map((service) => ({
          id: service.id,
          name: service.name,
          durationMinutes: service.durationMinutes,
          price: service.price,
        }))
      )
    );
  }

  createServiceOption$(input: SaveServiceOptionInput): Observable<ServiceOption> {
    return this.providerTaskApiService.createProviderTask$({
      name: input.name,
      durationMinutes: input.durationMinutes,
      price: input.price,
      description: `Atendimento para ${input.name.toLowerCase()}.`,
    }).pipe(
      map((service) => ({
        id: service.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
        price: service.price,
      }))
    );
  }

  updateServiceOption$(serviceId: string, input: SaveServiceOptionInput): Observable<ServiceOption> {
    return this.providerTaskApiService.updateProviderTask$(serviceId, {
      name: input.name,
      durationMinutes: input.durationMinutes,
      price: input.price,
      description: `Atendimento para ${input.name.toLowerCase()}.`,
    }).pipe(
      map((service) => ({
        id: service.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
        price: service.price,
      }))
    );
  }

  deleteServiceOption$(serviceId: string): Observable<void> {
    return this.providerTaskApiService.deleteProviderTask$(serviceId);
  }

  getBookings$(): Observable<Booking[]> {
    return this.bookingApiService.getBookings$().pipe(
      map((bookings) => bookings.map((booking) => this.toUiBooking(booking))),
      map((bookings) =>
        [...bookings].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
      )
    );
  }

  getUpcomingBookings$(): Observable<Booking[]> {
    return this.getBookings$().pipe(
      map((bookings) =>
        bookings.filter(
          (booking) =>
            booking.status === 'confirmed' || booking.status === 'booked'
        )
      ),
      map((bookings) => bookings.filter((booking) => new Date(booking.startAt).getTime() >= Date.now())),
      map((bookings) => bookings.slice(0, 8))
    );
  }

  getSummary$(): Observable<DashboardSummary> {
    return this.getBookings$().pipe(
      map((bookings) => ({
        totalBookings: bookings.length,
        confirmedBookings: bookings.filter((booking) => booking.status === 'confirmed').length,
        cancelledBookings: bookings.filter((booking) => booking.status === 'cancelled').length,
        totalRevenue: bookings
          .filter((booking) => booking.status === 'confirmed')
          .reduce((acc, booking) => acc + booking.amount, 0),
      }))
    );
  }

  createBooking$(input: CreateBookingInput): Observable<Booking> {
    const parsedTaskId = Number(input.serviceId);
    const parsedUserId = Number(input.userId);
    if (!Number.isInteger(parsedTaskId) || !Number.isInteger(parsedUserId)) {
      return throwError(() => new Error('Usuario ou servico invalido para agendamento.'));
    }

    return this.bookingApiService
      .createBooking$({
        taskId: parsedTaskId,
        userId: parsedUserId,
        scheduledDate: input.startAt,
        paymentMethod: 'direct',
      })
      .pipe(
        map((booking) => this.toUiBooking(booking, input.clientName))
      );
  }

  cancelBooking$(bookingId: string, _userId: string, reason = 'Cancelado pelo usuario'): Observable<void> {
    const parsedBookingId = Number(bookingId);
    if (!Number.isInteger(parsedBookingId)) {
      return throwError(() => new Error('Agendamento invalido para cancelamento.'));
    }

    return this.bookingApiService
      .cancelBooking$({
        bookingId: parsedBookingId,
        reason,
      })
      .pipe(map(() => void 0));
  }

  private toUiBooking(apiBooking: ApiBooking, fallbackClientName = 'Cliente'): Booking {
    const normalizedStatus = apiBooking.status?.toLowerCase();
    const uiStatus: BookingStatus =
      normalizedStatus === 'cancelled'
        ? 'cancelled'
        : normalizedStatus === 'booked'
          ? 'booked'
          : 'confirmed';
    const isCancelled = uiStatus === 'cancelled';
    return {
      id: String(apiBooking.id),
      clientName: apiBooking.user?.name ?? fallbackClientName,
      userId: '',
      serviceId: String(apiBooking.task?.id ?? ''),
      serviceName: apiBooking.task?.title ?? 'Servico',
      startAt: apiBooking.scheduledDate,
      amount: Number(apiBooking.task?.price ?? 0),
      status: uiStatus,
      cancelledAt: isCancelled ? new Date().toISOString() : undefined,
      paymentTransactionId: apiBooking.paid ? `paid-${apiBooking.id}` : undefined,
    };
  }
}
