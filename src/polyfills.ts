/***************************************************************************************************
 * Load `$localize` onto the global scope - used if i18n tags appear in Angular templates.
 */
import '@angular/localize/init';
import { Buffer } from 'buffer';
// https://stackoverflow.com/a/51232137
(globalThis as any).process = {
    env: { DEBUG: undefined },
    version: [],
    browser: true
};

(globalThis as any).Buffer ??= Buffer;



/***************************************************************************************************
 * Zone JS is required by default for Angular itself.
 */
import 'zone.js';  // Included with Angular CLI.



/***************************************************************************************************
 * APPLICATION IMPORTS
 */
import 'babel-polyfill';
