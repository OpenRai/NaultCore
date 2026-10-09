import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import {DEFAULT_NOTIFICATION_LENGTH, NotificationService} from '../../services/notification.service';

@Component({
  standalone: false,
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./notifications.component.css']
})
export class NotificationsComponent implements OnInit {
  private notificationService = inject(NotificationService);


  notificationLength = DEFAULT_NOTIFICATION_LENGTH;

  notifications: any[] = [];

  ngOnInit() {
    this.notificationService.notifications$.subscribe(notification => {
      if (!notification) {
        return; // Default value
      }

      // Check the options
      const length = notification.options.length ?? this.notificationLength;
      const identifier = notification.options.identifier || null;

      // Duplicate suppression lives in NotificationService, which drops repeats
      // before emitting so nothing downstream reacts to a toast the user never
      // sees. Everything reaching here is safe to render.
      const newNotification = {
        type: notification.type,
        message: notification.message,
        cssClass: this.getCssClass(notification.type),
        identifier: identifier,
        length: length,
      };

      this.notifications.push(newNotification);
      if (length) {
        setTimeout(() => this.removeNotification(newNotification), length);
      }
    });

    this.notificationService.removeNotification$.subscribe(identifier => {
      if (!identifier) {
        return;
      }

      const existingNotification = this.notifications.find(n => n.identifier === identifier);
      if (existingNotification) {
        this.removeNotification(existingNotification);
      }
    });
  }

  private removeNotification(notification) {
    const existingNotification = this.notifications.findIndex(n => n === notification);
    if (existingNotification !== -1) {
      this.notifications.splice(existingNotification, 1);
    }
  }

  private getCssClass(type) {
    switch (type) {
      default:
      case 'info': return 'uk-alert-primary';
      case 'success': return 'uk-alert-success';
      case 'warning': return 'uk-alert-warning';
      case 'error': return 'uk-alert-danger';
    }
  }

}
