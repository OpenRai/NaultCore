import { TestBed, inject } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { AppSettingsService } from './app-settings.service';

describe('AppSettingsService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AppSettingsService,
        { provide: TranslocoService, useValue: {} },
      ]
    });
  });

  it('returns the API origin as a trailing-slash URL', inject([AppSettingsService], (service: AppSettingsService) => {
    service.settings.serverAPI = 'https://node.somenano.com/proxy?test=true#section';

    expect(service.getServerApiBaseUrl()).toBe('https://node.somenano.com/');
  }));

  it('defaults to the local Nanoidenticons renderer', inject([AppSettingsService], (service: AppSettingsService) => {
    expect(service.settings.identiconsStyle).toBe('nanoidenticons');
  }));
});
