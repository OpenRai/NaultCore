import { provideTransloco, TranslocoLoader, TranslocoModule } from '@jsverse/transloco';
import { Injectable, NgModule } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  constructor() {}

  getTranslation(lang: string) {
    return import(/* webpackChunkName: "translation" */ `../../assets/i18n/${lang}.branding.json`).then(res => res.default);
  }
}

@NgModule({
  // Imported as well as exported: re-exporting a module the host never imports
  // leaves TranslocoPipe out of this module's own compilation scope, which
  // breaks any TestBed that declares a component using the pipe.
  imports: [ TranslocoModule ],
  exports: [ TranslocoModule ],
  providers: [
    provideTransloco({
      config: {
        availableLangs: [
          { id: 'en', label: 'English' },
          // { id: 'de', label: 'Deutsch' }
        ],
        defaultLang: 'en',
        fallbackLang: 'en',
        missingHandler: {
          // It will use the first language set in the `fallbackLang` property
          useFallbackTranslation: true
        },
        // Remove this option if your application doesn't support changing language in runtime.
        reRenderOnLangChange: true,
        prodMode: environment.production,
      },
      loader: TranslocoHttpLoader,
    }),
  ]
})
export class TranslocoRootModule {}
