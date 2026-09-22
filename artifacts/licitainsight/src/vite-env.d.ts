/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for the search API. Default `http://localhost:3001/api`. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
