import { AccountPipe } from "./account.pipe";
import { TestBed } from "@angular/core/testing";
import { UtilService } from "../services/util.service";
import { AppSettingsService } from "../services/app-settings.service";

describe("AccountPipe", () => {
  it("create an instance", () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: UtilService, useValue: {} },
        { provide: AppSettingsService, useValue: {} },
      ],
    });
    const pipe = TestBed.runInInjectionContext(() => new AccountPipe());
    expect(pipe).toBeTruthy();
  });
});
