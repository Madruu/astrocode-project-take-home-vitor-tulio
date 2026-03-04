/**
 * Maps backend error messages (English) to Portuguese for user-facing display.
 * Used by the HTTP interceptor and components to show consistent Portuguese messages.
 */
const ERROR_MESSAGES_PT: Record<string, string> = {
  // Auth
  'Invalid credentials': 'E-mail ou senha inválidos.',
  'Invalid token payload': 'Sessão inválida. Faça login novamente.',

  // User
  'User with this email already exists': 'Já existe um usuário com este e-mail.',
  'User not found': 'Usuário não encontrado.',
  'As senhas não coincidem': 'As senhas não coincidem.',

  // Task
  'Only provider users can create tasks': 'Apenas prestadores podem criar serviços.',
  'Only provider users can update tasks': 'Apenas prestadores podem atualizar serviços.',
  'Only provider users can delete tasks': 'Apenas prestadores podem excluir serviços.',
  'Provider user not found': 'Prestador não encontrado.',
  'Task not found': 'Serviço não encontrado.',
  'You do not have permission to modify this task':
    'Você não tem permissão para modificar este serviço.',

  // Booking
  'Invalid or past date': 'Data inválida ou já passada.',
  'Invalid or past scheduled date': 'Data do agendamento inválida ou já passada.',
  'You can only create bookings for your own user account':
    'Você só pode criar agendamentos para sua própria conta.',
  'Time slot already booked': 'Este horário já está reservado.',
  'Time slot already unavailable': 'Este horário já está indisponível.',
  'Bookings not found': 'Agendamentos não encontrados.',
  'Booking not found': 'Agendamento não encontrado.',
  'Booking user not found': 'Usuário do agendamento não encontrado.',
  'Booking task not found': 'Serviço do agendamento não encontrado.',
  'Booking already cancelled': 'Agendamento já foi cancelado.',
  'Only the provider owner can unblock this slot':
    'Apenas o prestador pode desbloquear este horário.',
  'Past bookings cannot be cancelled anymore':
    'Agendamentos passados não podem mais ser cancelados.',
  'You do not have permission to cancel this booking':
    'Você não tem permissão para cancelar este agendamento.',
  'Only provider users can block slots': 'Apenas prestadores podem bloquear horários.',
  'You do not have permission to block this task slot':
    'Você não tem permissão para bloquear horários deste serviço.',
  'Invalid date format': 'Formato de data inválido.',
  'date must match /^(\\d{2}\\/\\d{2}\\/\\d{4}|\\d{4}-\\d{2}-\\d{2})$/ regular expression':
    'Informe a data no formato DD/MM/AAAA ou AAAA-MM-DD.',
  'date must be a valid ISO 8601 date string':
    'Informe uma data válida (ex: AAAA-MM-DD).',

  // Payment / Wallet
  'Insufficient balance': 'Saldo insuficiente.',
  'Invalid balance or payment amount': 'Saldo ou valor do pagamento inválido.',
  'Invalid balance or task price': 'Saldo ou preço do serviço inválido.',
  'Invalid balance': 'Saldo inválido.',
  'Invalid user balance': 'Saldo do usuário inválido.',
  'User balance cannot exceed 1000000':
    'O saldo não pode exceder 1.000.000.',
  'Invalid payment amount': 'Valor do pagamento inválido.',
  'Payment amount must be greater than 0':
    'O valor do pagamento deve ser maior que zero.',
  'Invalid refund amount': 'Valor do estorno inválido.',
  'User id is required': 'ID do usuário é obrigatório.',
  'Invalid task price': 'Preço do serviço inválido.',

  // Pending payment
  'Pending payment not found': 'Pagamento pendente não encontrado.',
  'Pending payment without owner': 'Pagamento pendente sem proprietário.',
  'Pending payment does not belong to authenticated user':
    'O pagamento pendente não pertence ao usuário autenticado.',

  // PayPal
  'PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET first.':
    'PayPal não está configurado. Configure PAYPAL_CLIENT_ID e PAYPAL_CLIENT_SECRET.',
  'Invalid PAYPAL_FRONTEND_URL. Configure an absolute URL (for example: https://myapp.com/account).':
    'URL do frontend PayPal inválida. Configure uma URL absoluta (ex: https://meuapp.com/account).',
  'Invalid external reference': 'Referência externa inválida.',
  'Invalid external payment reference': 'Referência de pagamento externo inválida.',
  'PayPal auth failed: missing access token':
    'Falha na autenticação PayPal: token de acesso ausente.',
  'Invalid PayPal webhook signature headers':
    'Cabeçalhos de assinatura do webhook PayPal inválidos.',
  'PayPal webhook signature mismatch': 'Assinatura do webhook PayPal não confere.',
  'orderId is required': 'ID do pedido é obrigatório.',
  'Unable to confirm payment without external reference':
    'Não foi possível confirmar o pagamento sem referência externa.',
  'Payment does not belong to authenticated user':
    'O pagamento não pertence ao usuário autenticado.',
  'external_payment requires taskId, userId, and scheduledDate':
    'Pagamento externo requer taskId, userId e data agendada.',
};

/** Patterns for dynamic messages (message contains variable parts) */
const ERROR_PATTERNS_PT: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /^Monthly cancellation limit reached \(\d+\)$/,
    message: 'Limite mensal de cancelamentos atingido.',
  },
  {
    pattern: /^PayPal auth failed \(\d+\):/,
    message: 'Falha na autenticação PayPal.',
  },
  {
    pattern: /^PayPal request failed \(\d+\):/,
    message: 'Falha na requisição ao PayPal.',
  },
  {
    pattern: /^PayPal payment is not completed \(status:/,
    message: 'Pagamento PayPal não foi concluído.',
  },
  {
    pattern: /^PayPal order was created without checkout URL/,
    message: 'Erro ao criar pedido PayPal.',
  },
];

const DEFAULT_MESSAGE = 'Erro de comunicação com o servidor.';

/**
 * Translates a backend error message to Portuguese.
 * @param backendMessage - Raw message from the API (string or array of strings)
 * @returns Portuguese message for display
 */
export function translateErrorMessage(backendMessage: unknown): string {
  if (typeof backendMessage === 'string') {
    const trimmed = backendMessage.trim();
    if (!trimmed) return DEFAULT_MESSAGE;

    // Exact match
    const exact = ERROR_MESSAGES_PT[trimmed];
    if (exact) return exact;

    // Pattern match for dynamic messages
    for (const { pattern, message } of ERROR_PATTERNS_PT) {
      if (pattern.test(trimmed)) return message;
    }

    // Already in Portuguese or unknown - return as-is for user context
    return trimmed;
  }

  if (Array.isArray(backendMessage) && backendMessage.length > 0) {
    const first = backendMessage[0];
    if (typeof first === 'string') {
      return translateErrorMessage(first);
    }
  }

  return DEFAULT_MESSAGE;
}

/**
 * Extracts and translates the error message from an HTTP error response.
 * Checks error.error.message first (NestJS/backend format), then Error.message.
 */
export function getTranslatedErrorMessage(error: unknown): string {
  const httpError = error as { error?: { message?: unknown }; status?: number };
  if (httpError?.error?.message !== undefined) {
    return translateErrorMessage(httpError.error.message);
  }

  if (error instanceof Error && error.message) {
    return translateErrorMessage(error.message);
  }

  return DEFAULT_MESSAGE;
}
