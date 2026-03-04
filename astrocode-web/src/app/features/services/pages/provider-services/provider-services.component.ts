import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BehaviorSubject } from 'rxjs';
import { take } from 'rxjs/operators';

import {
  ProviderTask,
  ProviderTaskApiService,
} from '../../../../core/services/provider-task-api.service';
import { AuthService } from '../../../auth/services/auth.service';
import { getTranslatedErrorMessage } from '../../../../core/utils/error-messages.pt';

interface ProviderServiceCard {
  id: string;
  title: string;
  category: string;
  description: string;
  durationLabel: string;
  priceLabel: string;
  durationMinutes: number;
  price: number;
}

@Component({
  selector: 'app-provider-services',
  standalone: true,
  templateUrl: './provider-services.component.html',
  styleUrl: './provider-services.component.css',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
  ],
})
export class ProviderServicesComponent implements OnInit {
  private providerTaskApiService = inject(ProviderTaskApiService);
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private servicesSubject = new BehaviorSubject<ProviderServiceCard[]>([]);

  readonly user$ = this.authService.currentUser$;
  readonly editingServiceId = signal<string | null>(null);
  readonly formVisible = signal(false);
  readonly saving = signal(false);
  readonly deletingServiceId = signal<string | null>(null);
  readonly services$ = this.servicesSubject.asObservable();

  readonly serviceForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    durationMinutes: [30, [Validators.required, Validators.min(10)]],
    price: [50, [Validators.required, Validators.min(1)]],
  });

  ngOnInit(): void {
    this.loadServices();
  }

  openCreateForm(): void {
    this.editingServiceId.set(null);
    this.formVisible.set(true);
    this.serviceForm.reset({
      name: '',
      description: '',
      durationMinutes: 30,
      price: 50,
    });
  }

  openEditForm(service: ProviderServiceCard): void {
    this.editingServiceId.set(service.id);
    this.formVisible.set(true);
    this.serviceForm.reset({
      name: service.title,
      description: service.description,
      durationMinutes: service.durationMinutes,
      price: service.price,
    });
  }

  cancelForm(): void {
    this.formVisible.set(false);
    this.editingServiceId.set(null);
    this.serviceForm.reset({
      name: '',
      description: '',
      durationMinutes: 30,
      price: 50,
    });
  }

  saveService(): void {
    if (this.serviceForm.invalid) {
      this.serviceForm.markAllAsTouched();
      return;
    }

    const payload = this.serviceForm.getRawValue();
    const serviceRequest = {
      name: payload.name?.trim() ?? '',
      durationMinutes: Number(payload.durationMinutes),
      price: Number(payload.price),
      description:
        payload.description?.trim() ||
        `Atendimento de ${Number(payload.durationMinutes)} minutos para ${(payload.name ?? '').toLowerCase()}.`,
    };

    this.saving.set(true);

    const editingServiceId = this.editingServiceId();
    const action$ = editingServiceId
      ? this.providerTaskApiService.updateProviderTask$(editingServiceId, serviceRequest)
      : this.providerTaskApiService.createProviderTask$(serviceRequest);

    action$
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.loadServices();
          this.formVisible.set(false);
          this.editingServiceId.set(null);
          this.snackBar.open(
            editingServiceId ? 'Servico atualizado com sucesso.' : 'Servico criado com sucesso.',
            'Fechar',
            { duration: 2600 }
          );
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.snackBar.open(getTranslatedErrorMessage(error), 'Fechar', {
            duration: 3200,
          });
        },
      });
  }

  deleteService(service: ProviderServiceCard): void {
    this.deletingServiceId.set(service.id);
    this.providerTaskApiService
      .deleteProviderTask$(service.id)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.deletingServiceId.set(null);
          this.loadServices();
          if (this.editingServiceId() === service.id) {
            this.cancelForm();
          }
          this.snackBar.open('Servico removido com sucesso.', 'Fechar', { duration: 2600 });
        },
        error: (error: unknown) => {
          this.deletingServiceId.set(null);
          this.snackBar.open(getTranslatedErrorMessage(error), 'Fechar', {
            duration: 3200,
          });
        },
      });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['']);
  }

  private resolveCategory(name: string): string {
    const normalizedName = name.toLowerCase();
    if (normalizedName.includes('corte') || normalizedName.includes('barba')) {
      return 'Cabelo';
    }
    if (normalizedName.includes('manicure') || normalizedName.includes('unha')) {
      return 'Unhas';
    }
    if (normalizedName.includes('massagem') || normalizedName.includes('relax')) {
      return 'Bem-estar';
    }
    return 'Servicos';
  }

  private loadServices(): void {
    this.providerTaskApiService
      .getProviderTasks$()
      .pipe(take(1))
      .subscribe({
        next: (services) => {
          this.servicesSubject.next(services.map((service) => this.toProviderCard(service)));
        },
        error: (error: unknown) => {
          this.snackBar.open(getTranslatedErrorMessage(error), 'Fechar', {
            duration: 3200,
          });
        },
      });
  }

  private toProviderCard(service: ProviderTask): ProviderServiceCard {
    return {
      id: service.id,
      title: service.name,
      category: this.resolveCategory(service.name),
      description: service.description || `Atendimento para ${service.name.toLowerCase()}.`,
      durationLabel: `${service.durationMinutes} minutos`,
      priceLabel: `R$ ${service.price.toFixed(2)}`,
      durationMinutes: service.durationMinutes,
      price: service.price,
    };
  }
}
