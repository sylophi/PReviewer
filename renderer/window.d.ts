import type { RendererApi } from "../main/preload";

declare global {
  interface Window {
    api: RendererApi;
  }
}

export {};
