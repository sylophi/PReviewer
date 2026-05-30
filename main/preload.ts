// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge } from "electron";
import {
  dialog,
  diffs,
  fs,
  gh,
  repos,
  runtime,
  windowApi,
} from "@shared/ipc/client";

// The contract-driven IPC layer (see shared/ipc/) autogenerates the
// per-method calls + handler typings. This file just stitches the
// wrapped clients into the namespace shape the renderer expects under
// window.api.<domain>.<method>.
const api = {
  runtime,
  fs,
  dialog,
  repos,
  diffs,
  gh,
  window: windowApi,
} as const;

export type RendererApi = typeof api;

contextBridge.exposeInMainWorld("api", api);
