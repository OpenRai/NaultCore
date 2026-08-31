// This file is required by karma.conf.js and loads recursively all the .spec and framework files

import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting
} from '@angular/platform-browser-dynamic/testing';

// First, initialize the Angular testing environment.
getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(), {
    teardown: { destroyAfterEach: true }
  }
);

// A small compatibility bridge keeps incrementally migrated Vitest specs
// executable by the retained Karma/Jasmine suite during the transition.
const jasmineVi = {
  fn: (implementation?: (...args: any[]) => any) => {
    const spy = jasmine.createSpy('vitest-compat');
    if (implementation) spy.and.callFake(implementation);
    const compat = spy as any;
    compat.mockResolvedValue = (value: any) => {
      spy.and.returnValue(Promise.resolve(value));
      return compat;
    };
    compat.mockImplementation = (value: (...args: any[]) => any) => {
      spy.and.callFake(value);
      return compat;
    };
    return compat;
  },
  spyOn: (object: any, method: string) => {
    const spy = spyOn(object, method);
    const compat = spy as any;
    compat.mockReturnValue = (value: any) => {
      spy.and.returnValue(value);
      return compat;
    };
    compat.mockImplementation = (value: (...args: any[]) => any) => {
      spy.and.callFake(value);
      return compat;
    };
    return compat;
  },
};

(globalThis as any).vi ??= jasmineVi;
(globalThis as any).expect.objectContaining ??= jasmine.objectContaining;
