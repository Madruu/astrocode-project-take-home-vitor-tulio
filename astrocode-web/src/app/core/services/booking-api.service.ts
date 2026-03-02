import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { buildApiUrl } from '../config/api.config';

export interface ApiBooking {
  id: number;
  scheduledDate: string;
  status: string;
  paid: boolean;
  user?: {
    id: number;
    name: string;
    email?: string;
  };
  task?: {
    id: number;
    title: string;
    description: string;
    price: number | string;
  };
}

export interface CreateApiBookingInput {
  taskId: number;
  userId: number;
  scheduledDate: string;
  paymentMethod: 'wallet' | 'direct';
}

export interface CancelApiBookingInput {
  bookingId: number;
  reason: string;
}

@Injectable({
  providedIn: 'root',
})
export class BookingApiService {
  private http = inject(HttpClient);

  getBookings$(): Observable<ApiBooking[]> {
    return this.http.get<ApiBooking[]>(buildApiUrl('/booking/list'));
  }

  createBooking$(input: CreateApiBookingInput): Observable<ApiBooking> {
    return this.http.post<ApiBooking>(buildApiUrl('/booking/create'), input);
  }

  cancelBooking$(input: CancelApiBookingInput): Observable<ApiBooking> {
    return this.http.post<ApiBooking>(buildApiUrl('/booking/cancel'), input);
  }
}
