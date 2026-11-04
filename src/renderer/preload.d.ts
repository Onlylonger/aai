import type { ElectronApi } from '../main/preload';

declare global {
  interface Window {
    api: ElectronApi;
  }
}

export {};
