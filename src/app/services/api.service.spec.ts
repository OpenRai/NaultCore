import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiService } from './api.service';
import { AppSettingsService } from './app-settings.service';
import { NodeService } from './node.service';

describe('ApiService', () => {
  let service: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ApiService,
        {
          provide: AppSettingsService,
          useValue: { settings: { serverAPI: 'https://rpc.example/api', serverAuth: 'Bearer rpc-token' } },
        },
        {
          provide: NodeService,
          useValue: { node: { status: true }, setOnline: vi.fn(), setOffline: vi.fn(), setLoading: vi.fn() },
        },
      ],
    });

    service = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends the custom work-server Authorization header instead of the Nano RPC header', async () => {
    const work = service.workGenerateOnce(
      'A'.repeat(64),
      'FFFFFE0000000000',
      'https://work.example/api',
      true,
      'Bearer work-token',
    );

    const request = http.expectOne('https://work.example/api');
    expect(request.request.headers.get('Authorization')).toBe('Bearer work-token');
    request.flush({ work: '0000000000000000' });

    await expect(work).resolves.toEqual({ work: '0000000000000000' });
  });

  describe('probeServer', () => {
    it('returns success when node responds to version action', async () => {
      const probePromise = service.probeServer('https://candidate-rpc.example/api', 'Bearer candidate-token');

      const request = http.expectOne('https://candidate-rpc.example/api');
      expect(request.request.headers.get('Authorization')).toBe('Bearer candidate-token');
      expect(request.request.body).toEqual({ action: 'version' });
      request.flush({ node_vendor: 'Nano V26.0' });

      const result = await probePromise;
      expect(result.success).toBe(true);
      expect(result.version).toEqual({ node_vendor: 'Nano V26.0' });
    });

    it('returns error when node response fails', async () => {
      const probePromise = service.probeServer('https://candidate-rpc.example/api');

      const request = http.expectOne('https://candidate-rpc.example/api');
      request.flush('Network error', { status: 500, statusText: 'Internal Server Error' });

      const result = await probePromise;
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('probeWorkServer', () => {
    it('returns success when work server returns valid work', async () => {
      const probePromise = service.probeWorkServer('https://candidate-work.example/api', 'Bearer work-key');

      const request = http.expectOne('https://candidate-work.example/api');
      expect(request.request.headers.get('Authorization')).toBe('Bearer work-key');
      request.flush({ work: '1234567890ABCDEF' });

      const result = await probePromise;
      expect(result.success).toBe(true);
    });

    it('returns error when work server fails', async () => {
      const probePromise = service.probeWorkServer('https://candidate-work.example/api');

      const request = http.expectOne('https://candidate-work.example/api');
      request.flush('Work error', { status: 503, statusText: 'Service Unavailable' });

      const result = await probePromise;
      expect(result.success).toBe(false);
    });
  });
});
