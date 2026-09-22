/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `http` uses the real backend; anything else (default) uses the mock adapter. */
  readonly VITE_API_MODE?: 'mock' | 'http';
  /** Base URL for the HTTP adapter. Default `/api`. */
  readonly VITE_API_BASE_URL?: string;
  /** Simulated mock latency in ms. Default 350. */
  readonly VITE_MOCK_LATENCY_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
