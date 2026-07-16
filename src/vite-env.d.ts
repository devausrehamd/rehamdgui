/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DISCOVERY_URL?: string;
  readonly VITE_IDSERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
