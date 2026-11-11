import { WalletUnlockLinkComponent } from '../components/wallet-unlock-link/wallet-unlock-link.component';
import { ReceiveComponent } from '../components/receive/receive.component';
import { TranslocoRootModule } from '../transloco/transloco-root.module';
import { BreadcrumbComponent } from '../components/breadcrumb/breadcrumb.component';
import { AccountSummaryComponent } from '../components/transaction-account/account-summary.component';
import { TransactionAccountPickerComponent } from '../components/transaction-account/transaction-account-picker.component';
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { NanoAccountIdComponent } from '../components/helpers/nano-account-id/nano-account-id.component';
import { NanoIdenticonComponent } from '../components/helpers/nano-identicon/nano-identicon.component';
import { SendComponent } from '../components/send/send.component';
import { SweeperComponent } from '../components/sweeper/sweeper.component';
import { AccountPipe } from '../pipes/account.pipe';
import { AmountSplitPipe } from '../pipes/amount-split.pipe';
import { CurrencySymbolPipe } from '../pipes/currency-symbol.pipe';
import { FiatPipe } from '../pipes/fiat.pipe';
import { RaiPipe } from '../pipes/rai.pipe';
import { SqueezePipe } from '../pipes/squeeze.pipe';

@NgModule({
  declarations: [
    ReceiveComponent,
    SendComponent,
    SweeperComponent,
    AccountPipe,
    AmountSplitPipe,
    CurrencySymbolPipe,
    FiatPipe,
    RaiPipe,
    SqueezePipe,
  ],
  imports: [
    WalletUnlockLinkComponent,
    BreadcrumbComponent,
    TranslocoRootModule,
    NanoAccountIdComponent,
    NanoIdenticonComponent,
    AccountSummaryComponent,
    TransactionAccountPickerComponent,
    CommonModule, FormsModule, RouterModule,
  ],
  exports: [SendComponent, SweeperComponent],
})
export class LegacyComponentTestModule {}
