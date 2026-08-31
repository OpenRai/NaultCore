import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';

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

  it('returns the API origin as a trailing-slash URL', () => {
    const service = TestBed.inject(AppSettingsService);
    service.settings.serverAPI = 'https://node.somenano.com/proxy?test=true#section';

    expect(service.getServerApiBaseUrl()).toBe('https://node.somenano.com/');
  });

  it('defaults to the local Nanoidenticons renderer', () => {
    const service = TestBed.inject(AppSettingsService);
    expect(service.settings.identiconsStyle).toBe('nanoidenticons');
  });
});
