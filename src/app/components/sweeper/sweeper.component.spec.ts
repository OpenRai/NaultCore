import { ElementRef } from '@angular/core';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import { RaiPipe } from '../../pipes/rai.pipe';
import { SqueezePipe } from '../../pipes/squeeze.pipe';
import { AmountSplitPipe } from '../../pipes/amount-split.pipe';

@NgModule({
  declarations: [SweeperComponent, RaiPipe, SqueezePipe, AmountSplitPipe],
  imports: [FormsModule],
})
class SweeperTestModule {}

describe('SweeperComponent', () => {
  let notification: { sendInfo: ReturnType<typeof vi.fn> };
  let api: { accountInfo: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    notification = { sendInfo: vi.fn() };
    api = { accountInfo: vi.fn() };
    TestBed.configureTestingModule({
      imports: [SweeperTestModule],
      providers: [
        { provide: WalletService, useValue: {
          walletState: { accounts: [], selectedAccount: null },
          walletState$: new BehaviorSubject({ accounts: [] }),
          selectedAccountState$: new BehaviorSubject(null),
        } },
        { provide: NotificationService, useValue: notification },
        { provide: ModalService, useValue: {} },
        { provide: ApiService, useValue: api },
        { provide: WorkPoolService, useValue: { getWork: vi.fn(), suppressPrecomputation: vi.fn() } },
        { provide: AppSettingsService, useValue: { settings: {} } },
        { provide: NanoBlockService, useValue: { getRandomRepresentative: vi.fn() } },
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
    const done = vi.fn();

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
