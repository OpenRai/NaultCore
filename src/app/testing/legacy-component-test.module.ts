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
    SendComponent,
    SweeperComponent,
    NanoIdenticonComponent,
    NanoAccountIdComponent,
    AccountPipe,
    AmountSplitPipe,
    CurrencySymbolPipe,
    FiatPipe,
    RaiPipe,
    SqueezePipe,
  ],
  imports: [CommonModule, FormsModule, RouterModule],
  exports: [SendComponent, SweeperComponent],
})
export class LegacyComponentTestModule {}
