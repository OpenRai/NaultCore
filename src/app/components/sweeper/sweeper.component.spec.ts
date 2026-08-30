import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import * as nanocurrency from 'nanocurrency';

import { SweeperComponent } from './sweeper.component';
import { WalletService } from '../../services/wallet.service';
import { NotificationService } from '../../services/notification.service';
import { ModalService } from '../../services/modal.service';
import { ApiService } from '../../services/api.service';
import { WorkPoolService } from '../../services/work-pool.service';
import { AppSettingsService } from '../../services/app-settings.service';
import { NanoBlockService } from '../../services/nano-block.service';
import { UtilService } from '../../services/util.service';
import { Router } from '@angular/router';

describe('SweeperComponent', () => {
  let notification: jasmine.SpyObj<NotificationService>;
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    notification = jasmine.createSpyObj<NotificationService>('NotificationService', ['sendInfo']);
    api = jasmine.createSpyObj<ApiService>('ApiService', ['accountInfo']);
    TestBed.configureTestingModule({
      providers: [
        { provide: WalletService, useValue: {
          walletState: { accounts: [], selectedAccount: null },
          walletState$: new BehaviorSubject({ accounts: [] }),
          selectedAccountState$: new BehaviorSubject(null),
        } },
        { provide: NotificationService, useValue: notification },
        { provide: ModalService, useValue: {} },
        { provide: ApiService, useValue: api },
        { provide: WorkPoolService, useValue: jasmine.createSpyObj('WorkPoolService', ['getWork', 'suppressPrecomputation']) },
        { provide: AppSettingsService, useValue: { settings: {} } },
        { provide: NanoBlockService, useValue: jasmine.createSpyObj('NanoBlockService', ['getRandomRepresentative']) },
        { provide: UtilService, useValue: {} },
        { provide: Router, useValue: { getCurrentNavigation: () => ({ extras: { state: {} } }) } },
      ],
    });
  });

  it('skips a source account that is already the destination', async () => {
    const component = TestBed.runInInjectionContext(() => new SweeperComponent());
    const privateKey = '1'.repeat(64);
    const destination = nanocurrency.deriveAddress(nanocurrency.derivePublicKey(privateKey), { useNanoPrefix: true });
    component.destinationAccount = destination;
    component.logArea = { nativeElement: { scrollTop: 0, scrollHeight: 0 } } as ElementRef;
    const done = jasmine.createSpy('done');

    await component.processAccount(privateKey, done);

    expect(api.accountInfo).not.toHaveBeenCalled();
    expect(notification.sendInfo).toHaveBeenCalledWith(
      `Skipped source account ${destination}: it is already the sweep destination.`,
      { length: 10000 },
    );
    expect(component.output).toContain('already the sweep destination');
    expect(done).toHaveBeenCalledTimes(1);
  });
});
