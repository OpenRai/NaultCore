import { Injectable, inject } from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {HttpHeaders} from '@angular/common/http';
import {NodeService} from './node.service';
import {AppSettingsService} from './app-settings.service';
import { TxType } from './util.service';

@Injectable()
export class ApiService {
  private http = inject(HttpClient);
  private node = inject(NodeService);
  private appSettings = inject(AppSettingsService);

  storeKey = `nanovault-active-difficulty`;

  private async request(action, data, skipError, url = '', validateResponse?, authorization = this.appSettings.settings.serverAuth): Promise<any> {
    data.action = action;
    const apiUrl = url === '' ? this.appSettings.settings.serverAPI : url;
    if (!apiUrl) {
      this.node.setOffline(null); // offline mode
      return;
    }
    if (this.node.node.status === false) {
      if (!skipError) {
        this.node.setLoading();
      }
    }
    let options: any = {
      responseType: 'json',
    };
    if (authorization != null && authorization !== '') {
      options =
        Object.assign(
          {},
          options,
          {
            headers: new HttpHeaders()
              .set('Authorization', authorization)
          }
        );
    }
    return await this.http.post(apiUrl, data, options).toPromise()
      .then(res => {
        if ( typeof validateResponse === 'function' ) {
          const { err } = validateResponse(res);
          const isValidResponse = (err == null);

          if (isValidResponse === false) {
            throw {
              isValidationFailure: true,
              status: 500,
              reason: err,
              res,
            };
          };
        };

        this.node.setOnline();
        return res;
      })
      .catch(async err => {
        if (skipError) return;

        if ( err.isValidationFailure === true ) {
          console.log(
            'Node response failed validation.',
            err.reason,
            err.res
          );
        } else {
          console.log('Node responded with error', err.status);
        }

        if (this.appSettings.settings.serverName === 'random') {
          // choose a new backend and do the request again
          this.appSettings.loadServerSettings();
          await this.sleep(1000); // delay if all servers are down
          return this.request(action, data, skipError, '', validateResponse);
        } else {
          // hard exit
          if (err.status === 429) {
            this.node.setOffline('Too Many Requests to the node. Try again later or choose a different node.');
          } else {
            this.node.setOffline();
          }
          throw err;
        }
      });
  }

  async accountsBalances(accounts: string[]): Promise<{balances: any }> {
    return await this.request('accounts_balances', { accounts }, false);
  }
  async accountsFrontiers(accounts: string[]): Promise<{frontiers: any }> {
    return await this.request('accounts_frontiers', { accounts }, false);
  }
  async accountsPending(accounts: string[], count: number = 50): Promise<{blocks: any }> {
    return await this.request('accounts_pending', { accounts, count, source: true, include_only_confirmed: true }, false);
  }
  async accountsPendingLimit(accounts: string[], threshold: string, count: number = 50): Promise<{blocks: any }> {
    return await this.request('accounts_pending', { accounts, count, threshold, source: true, include_only_confirmed: true }, false);
  }
  async accountsPendingSorted(accounts: string[], count: number = 50): Promise<{blocks: any }> {
    return await this.request('accounts_pending',
      { accounts, count, source: true, include_only_confirmed: true, sorting: true }, false
    );
  }
  async accountsPendingLimitSorted(accounts: string[], threshold: string, count: number = 50): Promise<{blocks: any }> {
    return await this.request('accounts_pending',
      { accounts, count, threshold, source: true, include_only_confirmed: true, sorting: true }, false
    );
  }
  async delegatorsCount(account: string): Promise<{ count: string }> {
    return await this.request('delegators_count', { account }, false);
  }
  async representativesOnline(): Promise<{ representatives: any }> {
    return await this.request('representatives_online', { }, false);
  }

  async blocksInfo(blocks): Promise<{blocks: any, error?: string}> {
    return await this.request('blocks_info', { hashes: blocks, pending: true, source: true }, false);
  }
  async blockInfo(hash): Promise<any> {
    return await this.request('block_info', { hash: hash }, false);
  }
  async blockCount(): Promise<{count: number, unchecked: number, cemented: number }> {
    return await this.request('block_count', { include_cemented: 'true'}, false);
  }
  async workGenerate(hash, difficulty, workServer = '', workServerAuth = ''): Promise<{ work: string }> {
    return this.workGenerateOnce(hash, difficulty, workServer, false, workServerAuth);
  }

  /** Performs one work request without the random-server retry loop. */
  async workGenerateOnce(hash, difficulty, workServer = '', skipError = true, workServerAuth = ''): Promise<{ work: string }> {
    const validateResponse = (res) => {
      if(res.work == null) {
        return {
          err: `Missing field "work".`,
        };
      };

      if(typeof res.work !== 'string') {
        return {
          err: `Invalid type of field "work", expected "string", got "${ typeof res.work }".`,
        };
      };

      if(res.work.length !== 16) {
        return {
          err: `Invalid length of field "work", expected 16, got ${ res.work.length }.`,
        };
      };

      if( /^[0-9A-F]+$/i.test(res.work) === false ) {
        return {
          err: `Invalid contents of field "work", expected hex characters.`,
        };
      };

      return {
        err: null,
      };
    };

    return await this.request('work_generate', { hash, difficulty }, skipError || workServer !== '', workServer, validateResponse, workServer ? workServerAuth : undefined);
  }
  async process(block, subtype: TxType): Promise<{ hash: string, error?: string }> {
    return await this.request('process', { block: JSON.stringify(block), watch_work: 'false', subtype: TxType[subtype] }, false);
  }
  async accountHistory(account, count = 25, raw = false, offset = 0, reverse = false): Promise<{history: any }> {
    // use unlimited count if 0
    if (count === 0) {
      return await this.request('account_history', { account, raw, offset, reverse}, false);
    } else {
      return await this.request('account_history', { account, count, raw, offset, reverse}, false);
    }
  }
  async accountInfo(account): Promise<any> {
    return await this.request('account_info', { account, pending: true, representative: true, weight: true }, false);
  }
  async pending(account, count): Promise<any> {
    return await this.request('pending', { account, count, source: true, include_only_confirmed: true }, false);
  }
  async pendingLimit(account, count, threshold): Promise<any> {
    return await this.request('pending', { account, count, threshold, source: true, include_only_confirmed: true }, false);
  }
  async pendingSorted(account, count): Promise<any> {
    return await this.request('pending', { account, count, source: true, include_only_confirmed: true, sorting: true }, false);
  }
  async pendingLimitSorted(account, count, threshold): Promise<any> {
    return await this.request('pending', { account, count, threshold, source: true, include_only_confirmed: true, sorting: true }, false);
  }
  async version(): Promise<{rpc_version: number, store_version: number, protocol_version: number, node_vendor: string, network: string,
    network_identifier: string, build_info: string }> {
    return await this.request('version', { }, true);
  }
  async confirmationQuorum(): Promise<{quorum_delta: string, online_weight_quorum_percent: number, online_weight_minimum: string,
    online_stake_total: string, trended_stake_total: string, peers_stake_total: string }> {
    return await this.request('confirmation_quorum', { }, true);
  }
  async probeServer(apiUrl: string, authorization?: string): Promise<{ success: boolean; version?: any; blockCount?: any; error?: string }> {
    if (!apiUrl || (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://'))) {
      return { success: false, error: 'Invalid API URL' };
    }
    let headers = new HttpHeaders();
    if (authorization != null && authorization !== '') {
      headers = headers.set('Authorization', authorization);
    }
    try {
      const res: any = await this.http.post(apiUrl, { action: 'version' }, { headers, responseType: 'json' }).toPromise();
      if (res && (res.node_vendor || res.rpc_version != null || res.protocol_version != null)) {
        return { success: true, version: res };
      }
      const countRes: any = await this.http.post(apiUrl, { action: 'block_count' }, { headers, responseType: 'json' }).toPromise();
      if (countRes && countRes.count != null) {
        return { success: true, blockCount: countRes };
      }
      return { success: false, error: res?.error || 'Node returned an unexpected response' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Connection failed' };
    }
  }

  async probeWorkServer(workServerUrl: string, authorization?: string): Promise<{ success: boolean; error?: string }> {
    if (!workServerUrl || (!workServerUrl.startsWith('http://') && !workServerUrl.startsWith('https://'))) {
      return { success: false, error: 'Invalid work server URL' };
    }
    try {
      const dummyHash = '0000000000000000000000000000000000000000000000000000000000000000';
      const dummyThreshold = 'FFFFFFC000000000';
      const res = await this.workGenerateOnce(dummyHash, dummyThreshold, workServerUrl, true, authorization || '');
      if (res && res.work) {
        return { success: true };
      }
      return { success: false, error: 'Work server returned an empty or invalid response' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Work server connection failed' };
    }
  }

  public deleteCache() {
    localStorage.removeItem(this.storeKey);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
