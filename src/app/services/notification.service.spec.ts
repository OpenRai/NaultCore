import { TestBed } from '@angular/core/testing';

import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NotificationService]
    });
  });

  it('mirrors each toast to its matching console severity', () => {
    const service = TestBed.inject(NotificationService);
    const debug = vi.spyOn(console, 'debug');
    const info = vi.spyOn(console, 'info');
    const warning = vi.spyOn(console, 'warn');
    const error = vi.spyOn(console, 'error');

    service.sendInfo('Informational event');
    service.sendSuccess('Successful event');
    service.sendWarning('Warning event');
    service.sendError('Error event');

    expect(info).toHaveBeenCalledWith('[Notification]', 'ℹ️', 'Informational event');
    expect(info).toHaveBeenCalledWith('[Notification]', '✅', 'Successful event');
    expect(warning).toHaveBeenCalledWith('[Notification]', '⚠️', 'Warning event');
    expect(error).toHaveBeenCalledWith('[Notification]', '💥', 'Error event');
    expect(debug).not.toHaveBeenCalled();
  });
});
