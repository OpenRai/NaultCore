import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { NotificationService } from 'app/services/notification.service';
import { branding } from 'environments/branding';

interface InstallEvent extends Event {
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>;
  prompt(): void;
}

@Component({
  standalone: false,
  selector: 'app-install-widget',
  templateUrl: './install-widget.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./install-widget.component.less'],
})
export class InstallWidgetComponent implements OnInit {
  readonly branding = branding;
  private notifications = inject(NotificationService);


  installEvent: InstallEvent;
  showInstallPromotion = false;
  platform = this.getPlatform();
  promotablePlatforms = ['Android', 'iOS', 'iPadOS', 'Chrome OS'];

  ngOnInit() {
    if (!this.isPromotable()) {
      return;
    }

    // Show clickable installation banner (Chrome / Edge only)
    window.addEventListener('beforeinstallprompt', (event: InstallEvent) => {
      // Prevent the mini-infobar from appearing on mobile
      event.preventDefault();

      this.installEvent = event;
      this.showInstallPromotion = true;
    });

    // Fallback for iOS family
    if (this.isIosInstallable()) {
      setTimeout(() => {
        this.showInstallPromotion = true;
      });
    }
  }

  install() {
    if (!this.installEvent) {
      return;
    }

    this.installEvent.prompt();
    this.installEvent.userChoice.then((result) => {
      if (result.outcome === 'accepted') {
        this.notifications.sendSuccess(`${branding.applicationName} was successfully installed to the device.`);
        this.dismiss();
      }
    });
  }

  dismiss() {
    this.showInstallPromotion = false;
  }

  getPlatform() {
    const platform = window.navigator.platform;
    const userAgent = window.navigator.userAgent;

    if (platform.includes('Win')) {
      return 'Windows';
    } else if (platform.includes('Mac')) {
      return 'Mac';
    } else if (userAgent.includes('Android')) {
      return 'Android';
    } else if (userAgent.includes('CrOS')) {
      return 'Chrome OS';
    } else if (platform.includes('Linux')) {
      return 'Linux';
    } else if (platform.includes('iPhone')) {
      return 'iOS';
    } else if (platform.includes('iPad')) {
      return 'iPadOS';
    }
  }

  isIosInstallable() {
    if (!this.isPromotable() || this.isInstalled()) {
      return false;
    }
    return this.platform === 'iOS' || this.platform === 'iPadOS' && 'standalone' in window.navigator;
  }

  isPromotable() {
    if (this.isInstalled()) {
      return false;
    }
    return this.promotablePlatforms.includes(this.platform);
  }

  isInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches // Chrome & Edge
      || (window.navigator as any).standalone === true // Safari
      || window.navigator.userAgent.includes('Electron'); // Electron
  }
}
