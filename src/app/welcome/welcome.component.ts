import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { environment } from 'environments/environment';
import {WalletService} from '../services/wallet.service';
import {AppSettingsService} from '../services/app-settings.service';
import { TestIds } from '../testing/test-ids';

@Component({
  standalone: false,
  selector: 'app-welcome',
  templateUrl: './welcome.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./welcome.component.css']
})
export class WelcomeComponent implements OnInit {
  private walletService = inject(WalletService);
  settingsService = inject(AppSettingsService);

  readonly testIds = TestIds;

  donationAccount = environment.donationAddress;

  wallet = this.walletService.wallet;
  isConfigured = this.walletService.isConfigured;

  ngOnInit() {

  }

}
