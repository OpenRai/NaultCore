import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoService } from '@jsverse/transloco';
import { BreadcrumbComponent } from './breadcrumb.component';

@Component({ imports: [BreadcrumbComponent], template: '<app-breadcrumb current="Send" />' })
class SendPage {}

@Component({ imports: [BreadcrumbComponent], template: '<app-breadcrumb origin="accounts" current="My Main Account" />' })
class AccountPage {}

describe('Breadcrumb navigation', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'send', component: SendPage }, { path: 'account', component: AccountPage }]),
        { provide: TranslocoService, useValue: { translate: (key: string) => ({
          'navigation.breadcrumb': 'Breadcrumb',
          'navigation.dashboard': 'Dashboard',
          'general.accounts': 'Accounts',
        })[key] || key } },
      ],
    });
  });

  it('keeps Accounts as the parent across account changes and defaults invalid origins to Dashboard', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/send?origin=accounts&account=first');
    harness.detectChanges();
    const root = () => harness.routeNativeElement!;
    expect(root().querySelector('nav')?.getAttribute('aria-label')).toBe('Breadcrumb');
    expect(root().querySelector('a')?.getAttribute('href')).toBe('/accounts');
    expect(root().querySelector('[aria-current="page"]')?.textContent).toBe('Send');
    expect(root().querySelectorAll('li').length).toBe(2);
    expect(root().querySelectorAll('a').length).toBe(1);

    await harness.navigateByUrl('/send?origin=accounts&account=second');
    harness.detectChanges();
    expect(root().querySelector('a')?.getAttribute('href')).toBe('/accounts');
    for (const url of ['/send?origin=invalid', '/send', '/send?origin=dashboard']) {
      await harness.navigateByUrl(url);
      harness.detectChanges();
      expect(root().querySelector('a')?.getAttribute('href')).toBe('/wallet');
      expect(root().querySelector('a')?.textContent?.trim()).toBe('Dashboard');
    }
  });

  it('uses the explicit Accounts parent on account details regardless of URL origin', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/account?origin=dashboard');
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('a')?.getAttribute('href')).toBe('/accounts');
    expect(harness.routeNativeElement!.querySelector('[aria-current]')?.textContent).toBe('My Main Account');
  });
});
