import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, OnInit, DestroyRef, ElementRef, Injector, ViewChild, afterNextRender, inject, ChangeDetectionStrategy } from "@angular/core";
import BigNumber from "bignumber.js";
import { AddressBookService } from "../../services/address-book.service";
import { BehaviorSubject } from "rxjs";
import { WalletService } from "../../services/wallet.service";
import { NotificationService } from "../../services/notification.service";
import { ApiService } from "../../services/api.service";
import { UtilService } from "../../services/util.service";
import { WorkPoolService } from "../../services/work-pool.service";
import { AppSettingsService } from "../../services/app-settings.service";
import { ActivatedRoute, Router } from "@angular/router";
import { PriceService } from "../../services/price.service";
import { NanoBlockService } from "../../services/nano-block.service";
import { QrModalService } from "../../services/qr-modal.service";
import { environment } from "environments/environment";
import { TranslocoService } from "@jsverse/transloco";
import { HttpClient } from "@angular/common/http";
import * as nanocurrency from "nanocurrency";
import { SpendableAccount, formatSpendableAccountLabel, NanoNymAccount } from "../../types/spendable-account.types";
import { StealthAccount } from "../../types/nanonym.types";
import { TestIds } from '../../testing/test-ids';
import { NanoNymCryptoService } from "../../services/nanonym-crypto.service";
import { NostrNotificationService } from "../../services/nostr-notification.service";
import { NanoNymManagerService } from "../../services/nanonym-manager.service";
import { NanoNymAccountSelectionService } from "../../services/nanonym-account-selection.service";
import { OrbitdbNotificationService } from "../../services/orbitdb-notification.service";
import { WalletContextService } from "../../services/wallet-context.service";
import { formatNotificationAmount } from "../../utils/transaction-toast-amount";
import { formatNanoAmount } from '../../utils/nano-amount-format';

const nacl = typeof window !== 'undefined' ? window["nacl"] : null;

type ReviewedSendIntent = Readonly<{
  mode: 'regular' | 'nanonym';
  sourceId: string;
  destinationId: string;
  amount: BigNumber;
  walletAccount: any;
  useLedger: boolean;
  sendNostrNotification: boolean;
  nanoNymNotification?: Readonly<{
    ephemeralPublicKey: Uint8Array;
    notificationUri: string;
  }>;
  stealthAccounts?: readonly Readonly<StealthAccount>[];
  nanoNymIndex?: number;
}>;

@Component({
  standalone: false,
  selector: "app-send",
  templateUrl: "./send.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ["./send.component.css"],
})
export class SendComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private readonly navigation = inject(Router);
  private readonly injector = inject(Injector);
  @ViewChild('sourceHeading') private sourceHeading?: ElementRef<HTMLHeadingElement>;
  private readonly destroyRef = inject(DestroyRef);
  private walletService = inject(WalletService);
  private walletContext = inject(WalletContextService);
  private addressBookService = inject(AddressBookService);
  private notificationService = inject(NotificationService);
  private nodeApi = inject(ApiService);
  private nanoBlock = inject(NanoBlockService);
  price = inject(PriceService);
  private workPool = inject(WorkPoolService);
  settings = inject(AppSettingsService);
  private util = inject(UtilService);
  private qrModalService = inject(QrModalService);
  private http = inject(HttpClient);
  private translocoService = inject(TranslocoService);
  private nanoNymCrypto = inject(NanoNymCryptoService);
  nostrService = inject(NostrNotificationService);
  private nanoNymManager = inject(NanoNymManagerService);
  private accountSelection = inject(NanoNymAccountSelectionService);
  private orbitdbService = inject(OrbitdbNotificationService);

  readonly testIds = TestIds;
  readonly featureNanonyms = FEATURE_NANONYMS;
  nano = 1000000000000000000000000;

  activePanel = "send";
  choosingSource = true;
  choosingDestination = false;
  accountChoiceMessage = '';
  private requestedAccountId: string | null | undefined;
  private paymentQueryKey = '';

  get selectedSource(): SpendableAccount | null {
    return this.spendableAccounts.find(account => account.id === this.fromAccountID) || null;
  }

  get selectedDestination(): SpendableAccount | null {
    return this.spendableAccounts.find(account => account.id === this.toOwnAccountID) || null;
  }

  chooseSource(accountId: string): void {
    if (this.preparingTransaction || this.confirmingTransaction) return;
    if (!this.spendableAccounts.some(account => account.id === accountId)) return;
    this.fromAccountID = accountId;
    this.onFromAccountChange();
    this.choosingSource = false;
    this.focusSource();
    this.accountChoiceMessage = '';
    this.activePanel = 'send';
    if (this.toOwnAccountID === accountId) this.toOwnAccountID = '';
    this.requestedAccountId = accountId;
    void this.navigation.navigate([], {
      relativeTo: this.route, queryParams: { account: accountId }, queryParamsHandling: 'merge', replaceUrl: true,
    });
  }

  private focusSource(): void {
    afterNextRender(() => this.sourceHeading?.nativeElement.focus(), { injector: this.injector });
  }

  editPayment(): void {
    if (this.confirmingTransaction) return;
    this.activePanel = 'send';
    this.focusSource();
  }

  changeSource(): void {
    if (this.preparingTransaction || this.confirmingTransaction) return;
    this.activePanel = 'send';
    this.choosingDestination = false;
    this.choosingSource = true;
    this.fromAccountSelectionTouched = true;
  }

  chooseDestination(accountId: string): void {
    if (accountId === this.fromAccountID || !this.spendableAccounts.some(account => account.id === accountId)) return;
    this.toOwnAccountID = accountId;
    this.choosingDestination = false;
  }

  sendDestinationType = "external-address";

  accounts = this.walletService.walletState.accounts as any;
  spendableAccounts: SpendableAccount[] = [];
  selectedSpendableAccount: SpendableAccount | null = null;

  ALIAS_LOOKUP_DEFAULT_STATE = {
    fullText: "",
    name: "",
    domain: "",
  };

  aliasLookup = {
    ...this.ALIAS_LOOKUP_DEFAULT_STATE,
  };
  aliasLookupInProgress = {
    ...this.ALIAS_LOOKUP_DEFAULT_STATE,
  };
  aliasLookupLatestSuccessful = {
    ...this.ALIAS_LOOKUP_DEFAULT_STATE,
    address: "",
  };
  aliasResults$ = new BehaviorSubject([]);
  addressBookResults$ = new BehaviorSubject([]);
  isDestinationAccountAlias = false;
  showAddressBook = false;
  addressBookMatch = "";
  addressAliasMatch = "";

  amounts = [
    { name: "XNO", shortName: "XNO", value: "mnano" },
    { name: "knano", shortName: "knano", value: "knano" },
    { name: "nano", shortName: "nano", value: "nano" },
  ];
  selectedAmount = this.amounts[0];

  amount = null;
  amountExtraRaw = new BigNumber(0);
  amountFiat: number | null = null;
  rawAmount: BigNumber = new BigNumber(0);
  fromAccount: any = {};
  fromAccountID: any = "";
  fromAddressBook = "";
  toAccount: any = false;
  toAccountID = "";
  toOwnAccountID: any = "";
  toAddressBook = "";
  toAccountStatus = null;
  amountStatus = null;
  preparingTransaction = false;
  confirmingTransaction = false;
  private fromAccountSelectionTouched = false;

  // NanoNym-specific state (receiving)
  isNanoNymAddress = false;
  nanoNymParsedKeys: {
    version: number;
    spendPublic: Uint8Array;
    viewPublic: Uint8Array;
    notificationUri: string;
  } | null = null;
  stealthAddress = "";
  ephemeralPublicKey: Uint8Array | null = null;

  // NanoNym spending state
  isSpendingFromNanoNym = false;
  selectedStealthAccounts: StealthAccount[] = [];
  privacyWarningShown = false;
  privacyWarningDismissed = false;
  privacyWarningPending = false;
  sendProgress = { current: 0, total: 0 };

  async ngOnInit() {
    const params = this.route.snapshot.queryParams;

    this.updateQueries(params);

    this.addressBookService.loadAddressBook();

    // Subscribe to replayed regular-wallet and NanoNym projections. Both
    // streams emit immediately for late-mounted send views.
    this.walletService.walletState$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(snapshot => {
      this.accounts = snapshot.accounts as any;
    });
    this.walletService.spendableAccounts$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(accounts => {
      this.spendableAccounts = FEATURE_NANONYMS ? accounts : accounts.filter(account => account.type === 'regular');
      this.selectedSpendableAccount = this.selectedSource;
      if (this.fromAccountID && !this.selectedSource) {
        this.fromAccountID = '';
        this.activePanel = 'send';
        this.choosingSource = true;
        this.accountChoiceMessage = 'The source account is no longer available. Choose an account.';
      }
      // Account metadata can hydrate after a directly opened transaction route.
      // Defer to the complete synchronous account publication batch.
      queueMicrotask(() => {
        if (!this.destroyRef.destroyed && this.choosingSource && !this.fromAccountSelectionTouched) {
          this.applyRequestedAccount(this.requestedAccountId);
        }
      });
      if (this.toOwnAccountID && !this.selectedDestination) {
        this.toOwnAccountID = '';
        this.activePanel = 'send';
      }
    });

    // Refresh NanoNym balances independently; storage publishes its own
    // projection and does not invalidate regular-wallet state.
    this.loadSpendableAccounts();

    // Load privacy warning dismissed setting
    const dismissed = localStorage.getItem('nanonym-privacy-warning-dismissed');
    this.privacyWarningDismissed = dismissed === 'true';

    // Route context belongs to this draft, independently of sidebar selection.
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(queries => {
      if (this.preparingTransaction || this.confirmingTransaction) return;
      this.activePanel = 'send';
      const paymentQueryKey = JSON.stringify([queries.to ?? null, queries.amount ?? null]);
      if (paymentQueryKey !== this.paymentQueryKey) {
        this.updateQueries(queries);
        this.paymentQueryKey = paymentQueryKey;
      }
      const requested = queries.account || null;
      if (requested !== this.requestedAccountId) {
        this.requestedAccountId = requested;
        this.fromAccountSelectionTouched = false;
        this.activePanel = 'send';
        this.applyRequestedAccount(requested);
      }
    });
  }

  updateQueries(params) {
    if (params && params.amount && !isNaN(params.amount)) {
      const amountAsRaw = new BigNumber(
        this.util.nano.mnanoToRaw(new BigNumber(params.amount)),
      );

      this.amountExtraRaw = amountAsRaw.mod(this.nano).floor();

      this.amount = this.util.nano
        .rawToMnano(amountAsRaw.minus(this.amountExtraRaw))
        .toNumber();

      this.syncFiatPrice();
    }

    if (params && params.to) {
      this.toAccountID = params.to;
      this.offerLookupIfDestinationIsAlias();
      this.validateDestination();
      this.sendDestinationType = "external-address";
    }
  }

  private applyRequestedAccount(requestedAccountId: string | null | undefined): void {
    if (this.fromAccountSelectionTouched) return;
    const context = this.walletContext.resolveTransactionContext('send', requestedAccountId);
    const nanoNym = FEATURE_NANONYMS && this.spendableAccounts.find(account => account.type === 'nanonym' && account.id === requestedAccountId);
    const accountId = nanoNym ? nanoNym.id : context.accountId;
    this.fromAccountID = accountId || '';
    this.selectedSpendableAccount = this.spendableAccounts.find(account => account.id === this.fromAccountID) || null;
    this.choosingSource = !accountId;
    this.accountChoiceMessage = requestedAccountId && !accountId
      ? 'The requested source account is not available in this wallet. Choose an account.' : '';
  }

  // An update to the Nano amount, sync the fiat value
  syncFiatPrice() {
    if (!this.validateAmount() || Number(this.amount) === 0) {
      this.amountFiat = null;
      return;
    }
    const rawAmount = this.getAmountBaseValue(this.amount || 0).plus(
      this.amountExtraRaw,
    );
    if (rawAmount.lte(0)) {
      this.amountFiat = null;
      return;
    }

    // This is getting hacky, but if their currency is bitcoin, use 6 decimals, if it is not, use 2
    const precision =
      this.settings.settings.displayCurrency === "BTC" ? 1000000 : 100;

    // Determine fiat value of the amount
    const fiatAmount = this.util.nano
      .rawToMnano(rawAmount)
      .times(this.price.price.lastPrice)
      .times(precision)
      .floor()
      .div(precision)
      .toNumber();

    this.amountFiat = fiatAmount;
  }

  // An update to the fiat amount, sync the nano value based on currently selected denomination
  syncNanoPrice() {
    if (!this.amountFiat) {
      this.amount = "";
      return;
    }
    if (!this.util.string.isNumeric(this.amountFiat)) return;
    const rawAmount = this.util.nano.mnanoToRaw(
      new BigNumber(this.amountFiat).div(this.price.price.lastPrice),
    );
    const nanoVal = this.util.nano.rawToNano(rawAmount).floor();
    const nanoAmount = this.getAmountValueFromBase(
      this.util.nano.nanoToRaw(nanoVal),
    );

    this.amount = nanoAmount.toNumber();
  }

  onDestinationAddressInput() {
    this.addressAliasMatch = "";
    this.addressBookMatch = "";

    this.offerLookupIfDestinationIsAlias();
    this.searchAddressBook();

    const destinationAddress = this.toAccountID || "";

    const nanoURIScheme = /^nano:.+$/;
    const isNanoURI = nanoURIScheme.test(destinationAddress);

    if (isNanoURI === true) {
      const url = new URL(destinationAddress);

      if (this.util.account.isValidAccount(url.pathname)) {
        const amountAsRaw = url.searchParams.get("amount");

        const amountAsXNO = amountAsRaw
          ? nanocurrency
              .convert(amountAsRaw, {
                from: nanocurrency.Unit.raw,
                to: nanocurrency.Unit.NANO,
              })
              .toString()
          : null;

        setTimeout(() => {
          this.updateQueries({
            to: url.pathname,
            amount: amountAsXNO,
          });
        }, 10);
      }
    }
  }

  searchAddressBook() {
    this.showAddressBook = true;
    const search = this.toAccountID || "";
    const addressBook = this.addressBookService.addressBook;

    const matches = addressBook
      .filter((a) => a.name.toLowerCase().indexOf(search.toLowerCase()) !== -1)
      .slice(0, 5);

    this.addressBookResults$.next(matches);
  }

  offerLookupIfDestinationIsAlias() {
    const destinationAddress = this.toAccountID || "";

    const mayBeAnAlias =
      destinationAddress.startsWith("@") === true &&
      destinationAddress.includes(".") === true &&
      destinationAddress.endsWith(".") === false &&
      destinationAddress.includes("/") === false &&
      destinationAddress.includes("?") === false;

    if (mayBeAnAlias === false) {
      this.isDestinationAccountAlias = false;
      this.aliasLookup = {
        ...this.ALIAS_LOOKUP_DEFAULT_STATE,
      };
      this.aliasResults$.next([]);
      return;
    }

    this.isDestinationAccountAlias = true;

    let aliasWithoutFirstSymbol = destinationAddress.slice(1).toLowerCase();

    if (aliasWithoutFirstSymbol.startsWith("_@") === true) {
      aliasWithoutFirstSymbol = aliasWithoutFirstSymbol.slice(2);
    }

    const aliasSplitResults = aliasWithoutFirstSymbol.split("@");

    let aliasName = "";
    let aliasDomain = "";

    if (aliasSplitResults.length === 2) {
      aliasName = aliasSplitResults[0];
      aliasDomain = aliasSplitResults[1];
    } else {
      aliasDomain = aliasSplitResults[0];
    }

    this.aliasLookup = {
      fullText: `@${aliasWithoutFirstSymbol}`,
      name: aliasName,
      domain: aliasDomain,
    };

    this.aliasResults$.next([{ ...this.aliasLookup }]);

    this.toAccountStatus = 1; // Neutral state
  }

  async lookupAlias() {
    if (this.aliasLookup.domain === "") {
      return;
    }

    if (this.settings.settings.decentralizedAliasesOption === "disabled") {
      const UIkit = window["UIkit"];
      try {
        await UIkit.modal.confirm(
          `<p class="uk-alert uk-alert-warning"><br><span class="uk-flex"><span uk-icon="icon: warning; ratio: 3;" class="uk-align-center"></span></span>
          <span style="font-size: var(--text-base);">
          ${this.translocoService.translate("configure-app.decentralized-aliases-require-external-requests")}
          </span>`,
          {
            labels: {
              cancel: this.translocoService.translate("general.cancel"),
              ok: this.translocoService.translate(
                "configure-app.allow-external-requests",
              ),
            },
          },
        );

        this.settings.setAppSetting("decentralizedAliasesOption", "enabled");
      } catch (err) {
        // pressed cancel, or a different error
        return;
      }
    }

    this.toAccountStatus = 1; // Neutral state

    const aliasLookup = { ...this.aliasLookup };

    const aliasFullText = aliasLookup.fullText;
    const aliasDomain = aliasLookup.domain;

    const aliasName = aliasLookup.name !== "" ? aliasLookup.name : "_";

    const lookupUrl = `https://${aliasDomain}/.well-known/nano-currency.json?names=${aliasName}`;

    this.aliasLookupInProgress = {
      ...aliasLookup,
    };

    await this.http
      .get<any>(lookupUrl)
      .toPromise()
      .then((res) => {
        const isOutdatedRequest =
          this.aliasLookupInProgress.fullText !== aliasFullText;

        if (isOutdatedRequest === true) {
          return;
        }

        this.aliasLookupInProgress = {
          ...this.ALIAS_LOOKUP_DEFAULT_STATE,
        };

        try {
          const aliasesInJsonCount =
            Array.isArray(res.names) === true ? res.names.length : 0;

          if (aliasesInJsonCount === 0) {
            this.toAccountStatus = 0; // Error state
            this.notificationService.sendWarning(
              `Alias @${aliasName} not found on ${aliasDomain}`,
            );
            return;
          }

          const matchingAccount = res.names.find(
            (account) => account.name === aliasName,
          );

          if (matchingAccount == null) {
            this.toAccountStatus = 0; // Error state
            this.notificationService.sendWarning(
              `Alias @${aliasName} not found on ${aliasDomain}`,
            );
            return;
          }

          if (!this.util.account.isValidAccount(matchingAccount.address)) {
            this.toAccountStatus = 0; // Error state
            this.notificationService.sendWarning(
              `Alias ${aliasFullText} does not have a valid address`,
            );
            return;
          }

          this.toAccountID = matchingAccount.address;

          this.aliasLookupLatestSuccessful = {
            ...aliasLookup,
            address: this.toAccountID,
          };

          this.onDestinationAddressInput();
          this.validateDestination();

          return;
        } catch (err) {
          this.toAccountStatus = 0; // Error state
          this.notificationService.sendWarning(
            `Unknown error has occurred while trying to lookup ${aliasFullText}`,
          );
          return;
        }
      })
      .catch((err) => {
        this.aliasLookupInProgress = {
          ...this.ALIAS_LOOKUP_DEFAULT_STATE,
        };
        this.toAccountStatus = 0; // Error state

        if (err.status === 404) {
          this.notificationService.sendWarning(
            `No aliases found on ${aliasDomain}`,
          );
        } else {
          this.notificationService.sendWarning(
            `Could not reach domain ${aliasDomain}`,
          );
        }

        return;
      });
  }

  selectBookEntry(account) {
    this.showAddressBook = false;
    this.toAccountID = account;
    this.isDestinationAccountAlias = false;
    this.searchAddressBook();
    this.validateDestination();
  }

  setSendDestinationType(newType: string) {
    this.sendDestinationType = newType;
  }

  async validateDestination() {
    // The timeout is used to solve a bug where the results get hidden too fast and the click is never registered
    setTimeout(() => (this.showAddressBook = false), 400);

    // Remove spaces from the account id
    this.toAccountID = this.toAccountID.replace(/ /g, "");

    // Check for NanoNym address BEFORE nano_ validation
    if (this.toAccountID.startsWith("nnym_")) {
      if (!FEATURE_NANONYMS) {
        this.toAccountStatus = 0;
        this.notificationService.sendError(
          `NanoNym addresses are not supported in this build. Use NanoNymNault for privacy features.`,
        );
        return;
      }
      this.isNanoNymAddress = true;
      try {
        this.nanoNymParsedKeys = this.nanoNymCrypto.decodeNanoNymAddress(this.toAccountID);
        this.toAccountStatus = 2; // Valid NanoNym address
      } catch (error) {
        this.toAccountStatus = 0; // Invalid NanoNym address
        this.notificationService.sendError(
          `Invalid NanoNym address: ${error.message}`,
        );
      }
      return; // Don't check as nano_ address
    }

    // Reset NanoNym state if not a NanoNym address
    this.isNanoNymAddress = false;
    this.nanoNymParsedKeys = null;

    this.addressAliasMatch =
      this.aliasLookupLatestSuccessful.address !== "" &&
      this.aliasLookupLatestSuccessful.address === this.toAccountID
        ? this.aliasLookupLatestSuccessful.fullText
        : null;

    if (this.isDestinationAccountAlias === true) {
      this.addressBookMatch = null;
      this.toAccountStatus = 1; // Neutral state
      return;
    }

    this.addressBookMatch =
      this.addressBookService.getAccountName(this.toAccountID) ||
      this.getAccountLabel(this.toAccountID, null);

    if (
      !this.addressBookMatch &&
      this.toAccountID === environment.donationAddress
    ) {
      this.addressBookMatch = "NanoNyms Development";
    }

    // const accountInfo = await this.walletService.walletApi.accountInfo(this.toAccountID);
    this.toAccountStatus = null;
    if (this.util.account.isValidAccount(this.toAccountID)) {
      const accountInfo = await this.nodeApi.accountInfo(this.toAccountID);
      if (accountInfo.error) {
        if (accountInfo.error === "Account not found") {
          this.toAccountStatus = 1;
        }
      }
      if (accountInfo && accountInfo.frontier) {
        this.toAccountStatus = 2;
      }
    } else {
      this.toAccountStatus = 0;
    }
  }

  getAccountLabel(accountID, defaultLabel) {
    const walletAccount = this.walletService.getWalletAccount(accountID);

    if (walletAccount == null) {
      return defaultLabel;
    }

    return (
      this.translocoService.translate("general.account") +
      " #" +
      walletAccount.index
    );
  }

  validateAmount() {
    if (this.util.account.isValidNanoAmount(this.amount)) {
      this.amountStatus = 1;
      return true;
    } else {
      this.amountStatus = 0;
      return false;
    }
  }

  getDestinationID() {
    if (this.sendDestinationType === "external-address") {
      return this.toAccountID;
    }

    // 'own-address'
    const targetAccount = this.spendableAccounts.find(
      (a) => a.id === this.toOwnAccountID,
    );

    if (!targetAccount) {
      // Unable to find receiving account in wallet
      return "";
    }

    if (this.toOwnAccountID === this.fromAccountID) {
      // Sending to the same address is only allowed via 'external-address'
      return "";
    }

    return this.toOwnAccountID;
  }

  async sendTransaction() {
    if (this.preparingTransaction) return;
    if (!this.fromAccountID || this.choosingSource) {
      this.choosingSource = true;
      return this.notificationService.sendWarning('Choose the account to send from');
    }
    // Ensure the selected account is up-to-date before proceeding
    this.onFromAccountChange();

    const possibleDestinationID = this.getDestinationID();
    if (possibleDestinationID && possibleDestinationID.startsWith("nnym_")) {
      try {
        this.nanoNymParsedKeys = this.nanoNymCrypto.decodeNanoNymAddress(possibleDestinationID);
        this.isNanoNymAddress = true;
        return await this.sendToNanoNym();
      } catch (error) {
        return this.notificationService.sendError(`Invalid NanoNym address: ${error.message}`);
      }
    }

    // Handle sending TO NanoNym addresses with a separate flow
    if (this.isNanoNymAddress) {
      return await this.sendToNanoNym();
    }

    // Check if we're spending FROM a NanoNym
    if (this.selectedSpendableAccount?.type === 'nanonym') {
      return await this.sendFromNanoNym();
    }

    // Regular send flow
    const destinationID = this.getDestinationID();
    const isValid = this.util.account.isValidAccount(destinationID);
    if (!isValid) {
      return this.notificationService.sendWarning(
        `To account address is not valid`,
      );
    }
    if (!this.fromAccountID || !destinationID) {
      return this.notificationService.sendWarning(
        `From and to account are required`,
      );
    }
    if (!this.validateAmount()) {
      return this.notificationService.sendWarning(`Invalid XNO amount`);
    }

    this.preparingTransaction = true;

    const sourceId = this.fromAccountID;
    try {
      const from = await this.nodeApi.accountInfo(sourceId);
      const to = await this.nodeApi.accountInfo(destinationID);
      if (sourceId !== this.fromAccountID || this.choosingSource) return;

      if (!from) {
        return this.notificationService.sendError(`From account not found`);
      }

      from.balanceBN = new BigNumber(from.balance || 0);
      if (!to) return this.notificationService.sendError(`Destination account details unavailable`);
      to.balanceBN = new BigNumber(to.balance || 0);

      this.fromAccount = from;
      this.toAccount = to;

      const rawAmount = this.getAmountBaseValue(this.amount || 0);
      this.rawAmount = rawAmount.plus(this.amountExtraRaw);

      const nanoAmount = this.rawAmount.div(this.nano);

      if (this.amount < 0 || rawAmount.lessThan(0)) {
        return this.notificationService.sendWarning(`Amount is invalid`);
      }
      if (from.balanceBN.minus(this.rawAmount).lessThan(0)) {
        // The cached on-chain balance may predate funds that arrived while the
        // foreground was unreachable (sleep/wake with a silently dropped
        // subscription). Re-fetch once before failing: if the node now covers
        // the amount, an immediate whole-wallet refresh heals every stale
        // selector as well.
        const latest = await this.nodeApi.accountInfo(this.fromAccountID);
        if (sourceId !== this.fromAccountID || this.choosingSource) return;
        const latestBalance = new BigNumber(latest?.balance || 0);
        if (latestBalance.gte(this.rawAmount)) {
          from.balance = latest.balance;
          from.balanceBN = latestBalance;
          this.fromAccount = from;
          void this.walletService.refreshWalletState('send-stale-balance').catch(() => {
            // The send itself proceeds on the re-fetched balance; a failed
            // background refresh must not block it.
          });
        } else {
          return this.notificationService.sendError(
            `From account does not have enough XNO`,
          );
        }
      }

      // Determine a proper raw amount to show in the UI, if a decimal was entered
      this.amountExtraRaw = this.rawAmount.mod(this.nano);

      // Determine fiat value of the amount
      this.amountFiat = this.util.nano
        .rawToMnano(rawAmount)
        .times(this.price.price.lastPrice)
        .toNumber();

      this.fromAddressBook =
        this.addressBookService.getAccountName(this.fromAccountID) ||
        this.getAccountLabel(this.fromAccountID, "Account");

      this.toAddressBook =
        this.addressBookService.getAccountName(destinationID) ||
        this.getAccountLabel(destinationID, null);

      // Start precomputing the work...
      this.workPool.addWorkToCache(this.fromAccount.frontier, 1, this.fromAccountID);

      this.activePanel = "confirm";
    } catch {
      this.notificationService.sendError('Unable to prepare the payment. Please try again.');
    } finally {
      this.preparingTransaction = false;
    }
  }

  async confirmTransaction() {
    if (this.confirmingTransaction) return;
    this.confirmingTransaction = true;
    const intent = this.captureReviewedSendIntent();
    if (!intent) {
      this.confirmingTransaction = false;
      return;
    }

    if (intent.mode === 'nanonym') {
      try {
        return await this.confirmNanoNymSpend(intent);
      } finally {
        this.confirmingTransaction = false;
      }
    }

    try {
      if (this.walletService.isLocked()) {
        const wasUnlocked = await this.walletService.requestWalletUnlock();
        if (wasUnlocked === false) return;
      }

      const newHash = await this.nanoBlock.generateSend(
        intent.walletAccount,
        intent.destinationId,
        intent.amount,
        intent.useLedger,
      );

      if (newHash) {
        try {
          await this.walletService.refreshWalletState('regular-send');
        } catch (err) {
          // The block is already confirmed; a refresh failure must not turn a
          // successful send into a failed one.
          console.warn('Unable to refresh balances after sending', err);
        }

        // If NanoNym, send Nostr notification (if enabled)
        if (intent.nanoNymNotification && intent.sendNostrNotification) {
          await this.sendNostrNotification(newHash, intent.amount, intent.nanoNymNotification);
        }

        this.notificationService.removeNotification("success-send");
        const sentAmountLabel = formatNotificationAmount(intent.amount, this.settings?.settings?.minimumReceive);
        this.notificationService.sendSuccess(
          `Successfully sent ${sentAmountLabel}!`,
          { identifier: "success-send" },
        );
        this.resetForm();
      } else {
        if (!this.walletService.isLedgerWallet()) {
          this.notificationService.sendError(
            `There was an error sending your transaction, please try again.`,
          );
        }
      }
    } catch (err) {
      this.notificationService.sendError(
        `There was an error sending your transaction: ${err.message}`,
      );
    } finally {
      this.confirmingTransaction = false;
    }
  }

  private captureReviewedSendIntent(): ReviewedSendIntent | null {
    const sourceId = this.fromAccountID;
    const amount = new BigNumber(this.rawAmount);
    const destinationId = this.isNanoNymAddress ? this.stealthAddress : this.getDestinationID();
    if (!sourceId || !destinationId || !amount.isFinite() || amount.lte(0)) {
      this.notificationService.sendWarning('Review a valid source, destination, and amount before sending.');
      return null;
    }

    if (this.isSpendingFromNanoNym) {
      const stealthAccounts = this.selectedStealthAccounts.map(account => Object.freeze({
        ...account,
        publicKey: account.publicKey.slice(),
        privateKey: account.privateKey.slice(),
        ephemeralPublicKey: account.ephemeralPublicKey.slice(),
        balance: new BigNumber(account.balance),
      }));
      if (stealthAccounts.length === 0) {
        this.notificationService.sendWarning('Select stealth accounts to spend from.');
        return null;
      }
      const nanoNymIndex = (this.selectedSpendableAccount as any)?.index ?? stealthAccounts[0].parentNanoNymIndex;
      return Object.freeze({
        mode: 'nanonym',
        sourceId,
        destinationId: this.getDestinationID(),
        amount,
        walletAccount: null,
        useLedger: false,
        sendNostrNotification: false,
        stealthAccounts: Object.freeze(stealthAccounts),
        nanoNymIndex,
      });
    }

    const currentWalletAccount = this.walletService.getWalletAccount(sourceId);
    if (!currentWalletAccount) {
      this.notificationService.sendError('Unable to find sending account in wallet');
      return null;
    }
    const walletAccount = {
      ...currentWalletAccount,
      secret: currentWalletAccount.secret instanceof Uint8Array
        ? currentWalletAccount.secret.slice()
        : currentWalletAccount.secret,
      keyPair: currentWalletAccount.keyPair && Object.fromEntries(
        Object.entries(currentWalletAccount.keyPair).map(([key, value]) => [
          key,
          value instanceof Uint8Array ? value.slice() : value,
        ]),
      ),
    };
    const nanoNymNotification = this.isNanoNymAddress && this.nanoNymParsedKeys && this.ephemeralPublicKey
      ? Object.freeze({
          ephemeralPublicKey: this.ephemeralPublicKey.slice(),
          notificationUri: this.nanoNymParsedKeys.notificationUri,
        })
      : undefined;
    return Object.freeze({
      mode: 'regular',
      sourceId,
      destinationId,
      amount,
      walletAccount,
      useLedger: this.walletService.isLedgerWallet(),
      sendNostrNotification: !!nanoNymNotification && !!this.settings.settings.useNostr,
      nanoNymNotification,
    });
  }

  /**
   * Phase 3: Just-in-time opening of unopened stealth accounts before spending
   * Ensures all stealth accounts are opened (have frontier) before attempting send
   * Returns: true if all accounts are ready, false if unrecoverable failure
   */
  private async ensureStealthAccountsOpened(stealthAccounts: any[]): Promise<boolean> {
    const unopenedAccounts: any[] = [];

    // Check which accounts are unopened
    for (const account of stealthAccounts) {
      try {
        const accountInfo = await this.nodeApi.accountInfo(account.address);
        if (!accountInfo.frontier) {
          unopenedAccounts.push(account);
        }
      } catch (err) {
        // Account doesn't exist on node = unopened
        unopenedAccounts.push(account);
      }
    }

    // If all accounts are already opened, proceed
    if (unopenedAccounts.length === 0) {
      console.log('[Send-NanoNym] All stealth accounts already opened. Proceeding with send.');
      return true;
    }

    console.log(`[Send-NanoNym] Phase 3: ${unopenedAccounts.length}/${stealthAccounts.length} stealth accounts unopened. Attempting just-in-time opening...`);

    // Attempt to open unopened accounts
    let successCount = 0;
    for (let i = 0; i < unopenedAccounts.length; i++) {
      const account = unopenedAccounts[i];
      const progressMsg = `Opening stealth account ${i + 1}/${unopenedAccounts.length}...`;
      console.log(`[Send-NanoNym] ${progressMsg}`);
      this.notificationService.sendInfo(progressMsg, { identifier: 'stealth-opening-progress', timeout: 10000 });

      try {
        // Create pseudo wallet account for opening
        // NOTE: For stealth accounts, we use scalar-based signing (@noble/ed25519)
        // instead of nacl, because the private key is already a scalar (not a seed)
        const pseudoWalletAccount = {
          id: account.address,
          secret: account.privateKey,
          keyPair: null, // Not used for stealth accounts (scalar-based signing instead)
          index: -1,
          frontier: null,
          balance: new BigNumber(account.amountRaw || 0),
          balanceRaw: new BigNumber(account.amountRaw || 0),
          pending: new BigNumber(0),
          pendingRaw: new BigNumber(0),
          balanceFiat: 0,
          pendingFiat: 0,
          addressBookName: null,
          receivePow: false,
          isStealthAccount: true,  // Flag to use scalar signing in nano-block.service
          publicKeyHex: typeof account.publicKey === 'string' ? account.publicKey : this.util.hex.fromUint8(account.publicKey)  // Store the public key as hex string for signature verification
        };

        // Attempt to generate receive/open block
        const txHash = await this.nanoBlock.generateReceive(
          pseudoWalletAccount,
          account.txHash,
          false // Never ledger for stealth accounts
        );

        if (txHash) {
          console.log(`[Send-NanoNym] ✅ Opened stealth account ${account.address}. Hash: ${txHash}`);

          // Verify account is actually opened on-chain
          try {
            const verifyInfo = await this.nodeApi.accountInfo(account.address);
            if (verifyInfo && verifyInfo.frontier) {
              console.log(`[Send-NanoNym] ✅ Verified account opened on-chain. Frontier: ${verifyInfo.frontier}`);
              successCount++;
            } else {
              console.warn(`[Send-NanoNym] ⚠️ Account ${account.address} still has no frontier after opening attempt`);
            }
          } catch (verifyErr) {
            console.warn(`[Send-NanoNym] ⚠️ Could not verify account opened: ${verifyErr.message}`);
          }
        } else {
          console.warn(`[Send-NanoNym] ⚠️ generateReceive() returned null for ${account.address}. Open block may not have been published.`);
        }
      } catch (err) {
        console.error(`[Send-NanoNym] ⚠️ Error opening stealth account ${account.address}:`, err.message);
      }

      // Small delay between opens
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    this.notificationService.removeNotification('stealth-opening-progress');

    if (successCount === unopenedAccounts.length) {
      console.log(`[Send-NanoNym] ✅ All unopened accounts successfully opened and verified. Proceeding with send.`);
      this.notificationService.sendSuccess(`Stealth accounts opened. Sending transactions...`, { identifier: 'stealth-opening-complete' });
      return true;
    } else {
      // Fail completely if we couldn't open all accounts (don't do partial success)
      // because unopened accounts will fail during send anyway
      console.error(`[Send-NanoNym] ❌ Failed to open stealth accounts: ${successCount}/${unopenedAccounts.length} opened`);
      this.notificationService.sendInfo(
        `Could not open stealth accounts. ${successCount}/${unopenedAccounts.length} opened. Phase 2 background retry is active.`,
        { identifier: 'stealth-opening-failed', timeout: 0 }
      );
      return false; // Cannot proceed - all accounts must be opened
    }
  }

  /**
   * Confirm and execute spending from NanoNym stealth accounts (Section 8)
   * Sends multiple transactions, one from each selected stealth account
   */
  async confirmNanoNymSpend(intent: ReviewedSendIntent) {
    if (this.walletService.isLocked()) {
      const wasUnlocked = await this.walletService.requestWalletUnlock();
      if (wasUnlocked === false) {
        return;
      }
    }

    this.confirmingTransaction = true;

    try {
      const stealthAccounts = intent.stealthAccounts!;
      console.log(`[Send-NanoNym] Sending from ${stealthAccounts.length} stealth accounts`);

      let totalSent = new BigNumber(0);
      let successCount = 0;
      const txHashes: string[] = [];

      // Initialize progress tracking
      this.sendProgress.total = stealthAccounts.length;
      this.sendProgress.current = 0;

      // Phase 3: Just-in-time opening - ensure all stealth accounts are opened before spending
      console.log('[Send-NanoNym] Phase 3: Ensuring stealth accounts are opened...');
      const accountsReady = await this.ensureStealthAccountsOpened(stealthAccounts as StealthAccount[]);

      if (!accountsReady) {
        this.notificationService.sendError('Cannot open stealth accounts. Please try again in a moment.');
        this.confirmingTransaction = false;
        return;
      }

      // Send from each stealth account sequentially
      for (let i = 0; i < stealthAccounts.length; i++) {
        const stealthAccount = stealthAccounts[i];
        this.sendProgress.current = i + 1;

        // Fetch current account info from node to get accurate balance and frontier
        let accountInfo: any;
        try {
          accountInfo = await this.nodeApi.accountInfo(stealthAccount.address);
        } catch (err) {
          // This shouldn't happen after Phase 3 opening, but handle gracefully
          console.warn(`[Send-NanoNym] Could not get account info for ${stealthAccount.address}. Skipping.`);
          continue;
        }

        // Verify account has frontier (should be true after Phase 3)
        if (!accountInfo.frontier) {
          console.warn(`[Send-NanoNym] Account still unopened: ${stealthAccount.address}. Skipping.`);
          continue;
        }

        // Get account balance from node
        const nodeBalance = new BigNumber(accountInfo.balance || 0);

        // For opened accounts, use node balance (always >= 0)
        let accountBalance: BigNumber;
        if (nodeBalance.gte(0)) {
          accountBalance = nodeBalance;
        } else {
          // Fallback (shouldn't happen for opened accounts)
          accountBalance = new BigNumber(stealthAccount.amountRaw || 0);
        }

        // Skip if account has zero balance
        if (accountBalance.lte(0)) {
          console.warn(`[Send-NanoNym] Account has zero balance: ${stealthAccount.address}. Skipping.`);
          continue;
        }

        // Calculate how much to send from this account
        const remaining = intent.amount.minus(totalSent);
        const amountToSend = BigNumber.min(accountBalance, remaining);

        console.log(`[Send-NanoNym] Account ${this.sendProgress.current}/${this.sendProgress.total}:`, {
          address: stealthAccount.address,
          nodeBalance: nodeBalance.toString(),
          frontier: accountInfo.frontier,
          balance: accountBalance.toString(),
          sending: amountToSend.toString()
        });

        // Create temporary wallet account for this stealth address
        const tempAccount = {
          id: stealthAccount.address,
          secret: stealthAccount.privateKey,
          keyPair: {
            publicKey: stealthAccount.publicKey,
            secretKey: stealthAccount.privateKey
          },
          index: -1, // Special index for stealth accounts
          frontier: accountInfo.frontier, // Verified to exist above
          balance: accountBalance,
          balanceRaw: accountBalance.mod(this.nano),
          pending: new BigNumber(accountInfo.pending || 0),
          pendingRaw: new BigNumber(0),
          balanceFiat: 0,
          pendingFiat: 0,
          addressBookName: null,
          receivePow: false,
          isStealthAccount: true, // ← CRITICAL: Flag to use Schnorr scalar signing, NOT nacl
          publicKeyHex: this.util.hex.fromUint8(stealthAccount.publicKey) // ← Public key for signature verification
        };

        // Send the transaction
        const txHash = await this.nanoBlock.generateSend(
          tempAccount,
          intent.destinationId,
          amountToSend,
          false // Never ledger for stealth accounts
        );

        if (txHash) {
          console.log(`[Send-NanoNym] ✅ Transaction ${i + 1} sent:`, txHash);
          txHashes.push(txHash);
          totalSent = totalSent.plus(amountToSend);
          successCount++;

          // Update balance after each transaction to show incremental progress
          await this.nanoNymManager.refreshBalances(intent.nanoNymIndex);
          const reviewedAccount = this.selectedStealthAccounts.find(account => account.address === stealthAccount.address);
          if (reviewedAccount) reviewedAccount.done = true;
        } else {
          console.error(`[Send-NanoNym] ❌ Transaction ${i + 1} failed`);
          // Continue trying other accounts even if one fails
        }

        // Optional: Add small delay for privacy mode (Section 8.4)
        // For now, send immediately (fast UX)
      }

      if (successCount > 0) {
        const sentAmountLabel = formatNotificationAmount(totalSent, this.settings?.settings?.minimumReceive);
        this.notificationService.removeNotification("success-send");
        this.notificationService.sendSuccess(
          `Successfully sent ${sentAmountLabel} from ${successCount} stealth account${successCount > 1 ? 's' : ''}!`,
          { identifier: "success-send" }
        );

        console.log(`[Send-NanoNym] ✅ Complete:`, {
          totalSent: totalSent.toString(),
          successCount,
          txHashes
        });

        // Refresh NanoNym balances
        await this.nanoNymManager.refreshBalances(intent.nanoNymIndex);

        this.resetForm();
      } else {
        this.notificationService.sendError(
          `Failed to send transactions from stealth accounts. Please try again.`
        );
      }
    } catch (err) {
      console.error('[Send-NanoNym] Error:', err);
      this.notificationService.sendError(
        `Error sending from NanoNym: ${err.message}`
      );
    }

    this.confirmingTransaction = false;
  }

  setMaxAmount() {
    // Handle NanoNym accounts differently
    if (this.selectedSpendableAccount?.type === 'nanonym') {
      const nanoNymAccount = this.selectedSpendableAccount as any;
      this.amountExtraRaw = nanoNymAccount.balanceRaw;

      const nanoVal = this.util.nano.rawToNano(nanoNymAccount.balance).floor();
      const maxAmount = this.getAmountValueFromBase(
        this.util.nano.nanoToRaw(nanoVal),
      );
      this.amount = maxAmount.toNumber();
      this.syncFiatPrice();
      return;
    }

    // Regular wallet account
    const walletAccount = this.walletService.getWalletAccount(this.fromAccountID);
    if (!walletAccount) {
      return;
    }

    this.amountExtraRaw = walletAccount.balanceRaw;

    const nanoVal = this.util.nano.rawToNano(walletAccount.balance).floor();
    const maxAmount = this.getAmountValueFromBase(
      this.util.nano.nanoToRaw(nanoVal),
    );
    this.amount = maxAmount.toNumber();
    this.syncFiatPrice();
  }

  resetRaw() {
    this.amountExtraRaw = new BigNumber(0);
  }

  getAmountBaseValue(value) {
    switch (this.selectedAmount.value) {
      default:
      case "nano":
        return this.util.nano.nanoToRaw(value);
      case "knano":
        return this.util.nano.knanoToRaw(value);
      case "mnano":
        return this.util.nano.mnanoToRaw(value);
    }
  }

  getAmountValueFromBase(value) {
    switch (this.selectedAmount.value) {
      default:
      case "nano":
        return this.util.nano.rawToNano(value);
      case "knano":
        return this.util.nano.rawToKnano(value);
      case "mnano":
        return this.util.nano.rawToMnano(value);
    }
  }

  // open qr reader modal
  openQR(reference, type) {
    const qrResult = this.qrModalService.openQR(reference, type);
    qrResult.then(
      (data) => {
        switch (data.reference) {
          case "account1":
            this.toAccountID = data.content;
            this.validateDestination();
            break;
        }
      },
      () => {},
    );
  }

  copied() {
    this.notificationService.removeNotification("success-copied");
    this.notificationService.sendSuccess(`Successfully copied to clipboard!`, {
      identifier: "success-copied",
    });
  }

  // NanoNym send flow
  async sendToNanoNym() {
    if (!this.fromAccountID || !this.nanoNymParsedKeys) {
      return this.notificationService.sendWarning(
        `From account and valid NanoNym address are required`,
      );
    }
    if (!this.validateAmount()) {
      return this.notificationService.sendWarning(`Invalid XNO amount`);
    }

    this.preparingTransaction = true;

    try {
      // 1. Generate ephemeral key for this payment
      const ephemeral = this.nanoNymCrypto.generateEphemeralKey();
      this.ephemeralPublicKey = ephemeral.public;

      // 2. Generate shared secret via ECDH
      const sharedSecret = this.nanoNymCrypto.generateSharedSecret(
        ephemeral.private,
        this.nanoNymParsedKeys.viewPublic,
      );

      // 3. Derive one-time stealth address
      const stealth = this.nanoNymCrypto.deriveStealthAddress(
        sharedSecret,
        ephemeral.public,
        this.nanoNymParsedKeys.spendPublic,
      );
      this.stealthAddress = stealth.address;

      // DEBUG: Log sender-side stealth address computation
      console.log('[Send] SENDER-SIDE STEALTH ADDRESS COMPUTATION');
      console.log('[Send] Ephemeral public (R):', this.bytesToHex(ephemeral.public));
      console.log('[Send] Recipient B_spend:', this.bytesToHex(this.nanoNymParsedKeys.spendPublic));
      console.log('[Send] Recipient B_view:', this.bytesToHex(this.nanoNymParsedKeys.viewPublic));
      console.log('[Send] Shared secret:', this.bytesToHex(sharedSecret));
      console.log('[Send] Stealth address:', stealth.address);
      console.log('[Send] Stealth public key:', this.bytesToHex(stealth.publicKey));

      // 4. Get account info for from and stealth address
      const from = await this.nodeApi.accountInfo(this.fromAccountID);
      const to = await this.nodeApi.accountInfo(this.stealthAddress);

      if (!from) {
        this.preparingTransaction = false;
        return this.notificationService.sendError(`From account not found`);
      }

      from.balanceBN = new BigNumber(from.balance || 0);
      to.balanceBN = new BigNumber(to.balance || 0);

      this.fromAccount = from;
      this.toAccount = to;

      // 5. Calculate raw amount (same as regular send flow)
      const rawAmount = this.getAmountBaseValue(this.amount || 0);
      this.rawAmount = rawAmount.plus(this.amountExtraRaw);

      if (this.amount < 0 || rawAmount.lessThan(0)) {
        this.preparingTransaction = false;
        return this.notificationService.sendWarning(`Amount is invalid`);
      }
      if (from.balanceBN.minus(rawAmount).lessThan(0)) {
        this.preparingTransaction = false;
        return this.notificationService.sendError(
          `From account does not have enough XNO`,
        );
      }

      // Determine a proper raw amount to show in the UI, if a decimal was entered
      this.amountExtraRaw = this.rawAmount.mod(this.nano);

      // Determine fiat value of the amount
      this.amountFiat = this.util.nano
        .rawToMnano(rawAmount)
        .times(this.price.price.lastPrice)
        .toNumber();

      this.fromAddressBook =
        this.addressBookService.getAccountName(this.fromAccountID) ||
        this.getAccountLabel(this.fromAccountID, "Account");

      this.toAddressBook = "";

      // Start precomputing the work...
      this.workPool.addWorkToCache(this.fromAccount.frontier, 1, this.fromAccountID);

      this.preparingTransaction = false;
      this.activePanel = "confirm";
    } catch (err) {
      this.preparingTransaction = false;
      this.notificationService.sendError(
        `Error preparing NanoNym transaction: ${err.message}`,
      );
    }
  }

  async sendNostrNotification(
    txHash: string,
    amount: BigNumber = this.rawAmount,
    reviewedNotification = this.nanoNymParsedKeys && this.ephemeralPublicKey
      ? { ephemeralPublicKey: this.ephemeralPublicKey, notificationUri: this.nanoNymParsedKeys.notificationUri }
      : null,
  ) {
    if (!reviewedNotification) {
      console.error("Missing ephemeral key or NanoNym keys for notification");
      return;
    }

    try {
      const senderNostrKey = this.nanoNymCrypto.generateEphemeralKey();
      const notification = {
        version: 2 as const,
        protocol: "nanonym" as const,
        R: this.bytesToHex(reviewedNotification.ephemeralPublicKey),
        tx_hash: txHash.toLowerCase(),
        amount_raw: amount.toFixed(0),
      };

      console.log("[Send] Preparing Nostr notification:", {
        tx_hash: txHash,
        ephemeralPublicKey_hex: this.bytesToHex(reviewedNotification.ephemeralPublicKey),
        receiver_notification_uri: reviewedNotification.notificationUri,
        notification: notification,
      });

      const acceptedRelays = await this.nostrService.sendNotificationToUri(
        notification,
        senderNostrKey.private,
        reviewedNotification.notificationUri,
      );
      console.log(
        `[Send] Nostr notification sent to ${acceptedRelays.length} relays:`,
        acceptedRelays,
      );

      if (this.settings.settings.useOrbitDb) {
        console.log('[Send] 🪐 Sending parallel OrbitDB notification...');
        
        // Ensure OrbitDB is initialized before sending
        await this.orbitdbService.initialize();
        
        const orbitHash = await this.orbitdbService.sendNotification(
          notification,
          senderNostrKey.private,
          this.nostrService.resolveNotificationUriToPublicKey(
            this.nanoNymParsedKeys.notificationUri,
          )
        );
        if (orbitHash) {
          console.log(`[Send] ✅ OrbitDB notification sent: ${orbitHash}`);
        } else {
          console.warn('[Send] ⚠️ OrbitDB notification failed');
        }
      }

    } catch (error) {
      console.error("[Send] Failed to send Nostr notification:", error);
      this.notificationService.sendWarning(
        "Transaction sent but notification failed. Recipient may not see payment immediately.",
      );
    }
  }

  /**
   * Send flow when spending FROM a NanoNym (Section 8)
   */
  async sendFromNanoNym() {
    const nanoNymAccount = this.selectedSpendableAccount as any;
    const destinationID = this.getDestinationID();

    // Validate inputs
    const isValid = this.util.account.isValidAccount(destinationID);
    if (!isValid) {
      return this.notificationService.sendWarning(`To account address is not valid`);
    }
    if (!destinationID) {
      return this.notificationService.sendWarning(`Destination account is required`);
    }
    if (!this.validateAmount()) {
      return this.notificationService.sendWarning(`Invalid XNO amount`);
    }

    this.preparingTransaction = true;

    try {
      // Reset amountExtraRaw to avoid adding previous send's extra amount
      this.amountExtraRaw = new BigNumber(0);

      const rawAmount = this.getAmountBaseValue(this.amount || 0);
      this.rawAmount = rawAmount.plus(this.amountExtraRaw);

      if (this.amount < 0 || rawAmount.lessThan(0)) {
        this.preparingTransaction = false;
        return this.notificationService.sendWarning(`Amount is invalid`);
      }

      // Refresh balances from node to ensure we have current data (fixes stale balance issue)
      console.log('[Send-NanoNym] Refreshing NanoNym balances from node...');
      await this.nanoNymManager.refreshBalances(nanoNymAccount.index);

      // Get updated account reference after refresh
      const updatedAccount = this.spendableAccounts.find(acc =>
        acc.type === 'nanonym' && (acc as any).index === nanoNymAccount.index
      ) as any;

      if (!updatedAccount) {
        this.preparingTransaction = false;
        return this.notificationService.sendError(`NanoNym account not found after refresh`);
      }

      // Use the updated account for all subsequent operations
      const currentNanoNymAccount = updatedAccount;

      // Use account selection algorithm to pick stealth accounts
      console.log('[Send-NanoNym] Before account selection:', {
        rawAmount: this.rawAmount.toString(),
        nanoNymLabel: currentNanoNymAccount.label,
        nanoNymBalance: currentNanoNymAccount.balance.toString(),
        stealthAccountsCount: currentNanoNymAccount.nanoNym.stealthAccounts.length,
        stealthAccounts: currentNanoNymAccount.nanoNym.stealthAccounts.map(sa => ({
          address: sa.address,
          amountRaw: sa.amountRaw,
          balance: sa.balance?.toString(),
          txHash: sa.txHash
        }))
      });

      const selectionResult = this.accountSelection.selectAccountsForSend(
        this.rawAmount,
        currentNanoNymAccount.nanoNym.stealthAccounts
      );

      console.log('[Send-NanoNym] Account selection result:', {
        selectedCount: selectionResult.accounts.length,
        totalBalance: selectionResult.totalBalance.toString(),
        requiresMultiple: selectionResult.requiresMultipleAccounts
      });

      if (selectionResult.accounts.length === 0) {
        this.preparingTransaction = false;
        console.error('[Send-NanoNym] Selection failed - insufficient balance');
        return this.notificationService.sendError(
          `Insufficient balance in ${currentNanoNymAccount.label}. Available: ${formatNotificationAmount(currentNanoNymAccount.balance, this.settings?.settings?.minimumReceive)}`
        );
      }

      // Store selected stealth accounts for confirmation
      this.selectedStealthAccounts = selectionResult.accounts;
      this.isSpendingFromNanoNym = true;

      console.log('[Send-NanoNym] Account selection result:', {
        requested: this.rawAmount.toString(),
        accountsSelected: selectionResult.accounts.length,
        totalBalance: selectionResult.totalBalance.toString(),
        requiresMultiple: selectionResult.requiresMultipleAccounts
      });

      // Get destination info
      const to = await this.nodeApi.accountInfo(destinationID);
      to.balanceBN = new BigNumber(to.balance || 0);
      this.toAccount = to;

      // Set from account info (aggregate)
      this.fromAccount = {
        balance: currentNanoNymAccount.balance.toString(),
        balanceBN: currentNanoNymAccount.balance,
      };

      // Determine a proper raw amount to show in the UI
      this.amountExtraRaw = this.rawAmount.mod(this.nano);

      // Determine fiat value
      this.amountFiat = this.util.nano
        .rawToMnano(this.rawAmount)
        .times(this.price.price.lastPrice)
        .toNumber();

      this.fromAddressBook = currentNanoNymAccount.label;
      this.toAddressBook =
        this.addressBookService.getAccountName(destinationID) ||
        this.getAccountLabel(destinationID, null);

      this.preparingTransaction = false;

      // Check if privacy warning should be shown (Section 8.3)
      const privacyImpact = this.accountSelection.calculatePrivacyImpact(selectionResult);
      const shouldShowWarning = (
        selectionResult.requiresMultipleAccounts &&
        !this.privacyWarningDismissed &&
        !this.privacyWarningShown
      );

      console.log('[Send-NanoNym] Privacy check:', {
        requiresMultiple: selectionResult.requiresMultipleAccounts,
        dismissed: this.privacyWarningDismissed,
        shown: this.privacyWarningShown,
        shouldShow: shouldShowWarning,
        impact: privacyImpact
      });

      if (shouldShowWarning) {
        this.privacyWarningPending = true;
        this.showPrivacyWarning();
        return; // Don't proceed to confirm panel yet
      }

      this.activePanel = "confirm";
    } catch (err) {
      this.preparingTransaction = false;
      this.notificationService.sendError(
        `Error preparing NanoNym send: ${err.message}`
      );
    }
  }

  resetForm() {
    this.activePanel = "send";
    this.amount = null;
    this.amountFiat = null;
    this.resetRaw();
    this.toAccountID = "";
    this.toOwnAccountID = "";
    this.toAccountStatus = null;
    this.fromAddressBook = "";
    this.toAddressBook = "";
    this.addressBookMatch = "";
    this.addressAliasMatch = "";
    this.isNanoNymAddress = false;
    this.nanoNymParsedKeys = null;
    this.stealthAddress = "";
    this.ephemeralPublicKey = null;
    this.isSpendingFromNanoNym = false;
    this.selectedStealthAccounts = [];
    this.privacyWarningShown = false;
  }

  bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Load all spendable accounts (regular wallet accounts + NanoNyms)
   * Includes refreshing balances from Nano node
   */
  loadSpendableAccounts(): void {
    // Trigger background refresh of NanoNym balances from Nano node
    // This ensures we have up-to-date on-chain balances
    // Non-blocking: UI shows current balances and updates when refresh completes
    this.nanoNymManager.refreshAllBalances().catch(err => {
      console.error('[Send] Failed to refresh NanoNym balances:', err);
    });

  }

  /**
   * Format account label for dropdown display
   * Regular: "Account #0 (10.5 XNO)"
   * NanoNym: "Donations - nnym_12345...67890 (2.5 XNO)"
   */
  formatAccountLabel(account: SpendableAccount): string {
    return formatSpendableAccountLabel(
      account,
      (raw: BigNumber) => formatNanoAmount(raw, 'review', this.settings?.settings?.minimumReceive).display.replace(/\sXNO$/, '')
    );
  }

  /**
   * Handle fromAccountID changes
   * Find the corresponding SpendableAccount
   */
  onFromAccountChange(): void {
    this.fromAccountSelectionTouched = true;
    this.isSpendingFromNanoNym = false;
    this.selectedStealthAccounts = [];
    this.privacyWarningPending = false;
    this.privacyWarningShown = false;
    const selected = this.spendableAccounts.find(acc => acc.id === this.fromAccountID);
    this.selectedSpendableAccount = selected || null;

    console.log('[Send] Selected account:', {
      type: selected?.type,
      id: selected?.id,
      label: selected?.label,
      balance: selected?.balance.toString()
    });
  }

  /**
   * Show privacy warning modal (Section 8.3)
   */
  showPrivacyWarning(): void {
    const UIkit = window['UIkit'];
    UIkit.modal('#nanonym-privacy-warning-modal').show();
  }

  /**
   * User accepted privacy warning and wants to proceed
   */
  acceptPrivacyWarning(): void {
    const UIkit = window['UIkit'];
    UIkit.modal('#nanonym-privacy-warning-modal').hide();

    // Save dismissed setting if checkbox was checked
    if (this.privacyWarningDismissed) {
      localStorage.setItem('nanonym-privacy-warning-dismissed', 'true');
      console.log('[Send-NanoNym] Privacy warning dismissed permanently');
    }

    this.privacyWarningShown = true;
    this.privacyWarningPending = false;

    // Now proceed to confirmation panel
    this.activePanel = "confirm";
  }
}
