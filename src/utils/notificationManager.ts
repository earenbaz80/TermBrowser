/**
 * Integrated Web Browser & Terminal Notification Manager for TermBrowser OS
 * Connects the Web Notifications API (W3C standard) with the retro terminal
 * log stream, audio chimes, and anomaly alerts.
 */

import { TerminalNotification } from '../types';
import { soundEffects } from './soundEffects';

class NotificationManager {
  private isSupported: boolean = false;

  constructor() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.isSupported = true;
    }
  }

  public getPermission(): NotificationPermission {
    if (!this.isSupported) return 'denied';
    return Notification.permission;
  }

  public async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported) {
      throw new Error('La API de Notificaciones del navegador no está soportada en este entorno.');
    }

    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        soundEffects.playNotification();
      }
      return perm;
    } catch (err: any) {
      throw new Error(`Error al solicitar permisos: ${err.message}`);
    }
  }

  /**
   * Dispatch a notification both to the native browser (if allowed) and return
   * the payload for the terminal alert toast.
   */
  public dispatch(
    data: Omit<TerminalNotification, 'id' | 'timestamp'>,
    options: { playSound?: boolean } = { playSound: true }
  ): TerminalNotification {
    const timestamp = new Date().toLocaleTimeString();
    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const notification: TerminalNotification = {
      ...data,
      id,
      timestamp,
      resolved: false,
    };

    // Play appropriate sound effect
    if (options.playSound) {
      if (data.category === 'anomaly' || data.severity === 'critical') {
        soundEffects.playAnomalyAlert();
      } else {
        soundEffects.playNotification();
      }
    }

    // Trigger native browser notification if granted
    if (this.isSupported && Notification.permission === 'granted') {
      try {
        const nativeNotif = new Notification(data.title, {
          body: data.body,
          tag: id,
          badge: '/favicon.ico',
          icon: '/favicon.ico',
        });

        // Close after 7 seconds
        setTimeout(() => nativeNotif.close(), 7000);
      } catch (e) {
        // Fallback gracefully if blocked in iframe
      }
    }

    return notification;
  }
}

export const notificationManager = new NotificationManager();
