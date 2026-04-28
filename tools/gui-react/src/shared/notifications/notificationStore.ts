export type NotificationSeverity = 'error' | 'warning' | 'info' | 'success';
export type NotificationSource = 'query' | 'mutation' | 'manual';

export interface AppNotification {
  readonly id: string;
  readonly severity: NotificationSeverity;
  readonly source: NotificationSource;
  readonly title: string;
  readonly message: string;
  readonly createdAt: number;
}

export interface NotificationInput {
  readonly severity: NotificationSeverity;
  readonly source: NotificationSource;
  readonly title: string;
  readonly message: string;
}

export interface NotifyErrorOptions {
  readonly source?: NotificationSource;
  readonly title?: string;
}

type NotificationListener = () => void;

const MAX_NOTIFICATIONS = 4;
const FALLBACK_ERROR_MESSAGE = 'An unexpected error occurred.';

let nextNotificationId = 0;
let notifications: readonly AppNotification[] = [];
const listeners = new Set<NotificationListener>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function createNotificationId(): string {
  nextNotificationId += 1;
  return `notification-${nextNotificationId}`;
}

function normalizeText(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed || fallback;
}

function defaultErrorTitle(source: NotificationSource): string {
  if (source === 'query') return 'Query failed';
  if (source === 'mutation') return 'Mutation failed';
  return 'Request failed';
}

function messageFromThrowable(error: unknown): string {
  if (error instanceof Error) {
    return normalizeText(error.message, FALLBACK_ERROR_MESSAGE);
  }
  if (typeof error === 'string') {
    return normalizeText(error, FALLBACK_ERROR_MESSAGE);
  }
  return FALLBACK_ERROR_MESSAGE;
}

export function subscribeNotifications(listener: NotificationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNotificationSnapshot(): readonly AppNotification[] {
  return notifications;
}

export function enqueueNotification(input: NotificationInput): AppNotification {
  const notification: AppNotification = {
    id: createNotificationId(),
    severity: input.severity,
    source: input.source,
    title: normalizeText(input.title, 'Notification'),
    message: normalizeText(input.message, FALLBACK_ERROR_MESSAGE),
    createdAt: Date.now(),
  };

  notifications = [...notifications, notification].slice(-MAX_NOTIFICATIONS);
  emitChange();
  return notification;
}

export function notifyError(error: unknown, options: NotifyErrorOptions = {}): AppNotification {
  const source = options.source ?? 'manual';
  return enqueueNotification({
    severity: 'error',
    source,
    title: options.title ?? defaultErrorTitle(source),
    message: messageFromThrowable(error),
  });
}

export function dismissNotification(id: string): void {
  notifications = notifications.filter((notification) => notification.id !== id);
  emitChange();
}

export function clearNotifications(): void {
  notifications = [];
  emitChange();
}
