// The only sanctioned call sites for ipcMain.handle and
// webContents.send. Other modules register handlers via contracts and
// broadcast via the helper below; that keeps every payload running
// through a zod schema at the boundary.
import { app, ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import type { Contract } from "@shared/ipc/contract";
import type { BroadcastProducerPayload, Handlers } from "@shared/ipc/types";

export type HandlerContext = { event: IpcMainInvokeEvent };

// In dev we re-run handler results through the contract's output
// schema so handler drift (or schemas with .transform / .default that
// turn z.input into something different from z.output) surfaces here
// instead of as a confusing failure in the renderer. Packaged builds
// skip the extra parse to keep IPC latency at the per-handler cost.
const VALIDATE_OUTPUTS = !app.isPackaged;

export function registerContract<C extends Contract>(
  contract: C,
  handlers: Handlers<C, HandlerContext>,
): void {
  for (const key of Object.keys(contract) as (keyof C & string)[]) {
    const def = contract[key];
    if (def.kind !== "invoke") continue;
    const handler = (
      handlers as unknown as Record<string, (i: unknown, ctx: HandlerContext) => unknown>
    )[key];
    ipcMain.handle(def.channel, async (event, raw) => {
      const input = def.input.parse(raw);
      const result = await handler(input, { event });
      return VALIDATE_OUTPUTS ? def.output.parse(result) : result;
    });
  }
}

// Parse the payload at the producer so a bug here surfaces as a thrown
// error rather than as a confusing shape mismatch on the renderer
// side. Symmetric with input parsing at the registrar for invokes.
export function broadcast<C extends Contract, K extends keyof C>(
  contract: C,
  key: K,
  payload: BroadcastProducerPayload<C, K>,
  webContents: WebContents,
): void {
  const def = contract[key];
  if (def.kind !== "broadcast") {
    throw new Error(`broadcast called on non-broadcast key: ${String(key)}`);
  }
  webContents.send(def.channel, def.payload.parse(payload));
}
