import { Pipe, PipeTransform, inject } from '@angular/core';
import {UtilService} from '../services/util.service';
import {AppSettingsService} from '../services/app-settings.service';

@Pipe({
  standalone: false,
  name: 'account'
})
export class AccountPipe implements PipeTransform {
  private util = inject(UtilService);
  private settings = inject(AppSettingsService);


  transform(value: any, args?: any): any {
    // const val = this.util.account.setPrefix(value, this.settings.settings.displayPrefix);

    return value;
  }

}
