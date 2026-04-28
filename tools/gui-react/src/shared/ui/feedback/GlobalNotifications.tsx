import { useSyncExternalStore } from 'react';

import {
  dismissNotification,
  getNotificationSnapshot,
  subscribeNotifications,
  type AppNotification,
} from '../../notifications/notificationStore.ts';
import { CloseIcon } from '../filterBar/icons.tsx';
import './GlobalNotifications.css';

function ErrorIcon() {
  return (
    <svg className="sf-notification-icon-svg" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.25v4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.25" r="0.85" fill="currentColor" />
    </svg>
  );
}

function notificationRole(notification: AppNotification): 'alert' | 'status' {
  return notification.severity === 'error' ? 'alert' : 'status';
}

export function GlobalNotifications() {
  const notifications = useSyncExternalStore(
    subscribeNotifications,
    getNotificationSnapshot,
    getNotificationSnapshot,
  );

  if (notifications.length === 0) return null;

  return (
    <div className="sf-notification-region" aria-live="assertive" aria-relevant="additions removals">
      {notifications.map((notification) => (
        <section
          key={notification.id}
          className={`sf-notification sf-notification-${notification.severity}`}
          role={notificationRole(notification)}
        >
          <div className="sf-notification-icon" aria-hidden="true">
            <ErrorIcon />
          </div>
          <div className="sf-notification-content">
            <div className="sf-notification-title">{notification.title}</div>
            <div className="sf-notification-message">{notification.message}</div>
          </div>
          <button
            type="button"
            className="sf-notification-dismiss sf-icon-button"
            aria-label={`Dismiss ${notification.title}`}
            onClick={() => dismissNotification(notification.id)}
          >
            <CloseIcon className="sf-notification-dismiss-icon" />
          </button>
        </section>
      ))}
    </div>
  );
}
