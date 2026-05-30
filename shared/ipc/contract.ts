import { z } from "zod";

// An IPC call definition: either a request/response invoke or a
// fire-and-forget broadcast. Every channel name in the app lives in a
// contract entry. The schemas validate inputs at the registrar
// (handler side) and outputs in dev (see register.ts).

export type InvokeDef<
  I extends z.ZodTypeAny = z.ZodTypeAny,
  O extends z.ZodTypeAny = z.ZodTypeAny,
> = {
  kind: "invoke";
  channel: string;
  input: I;
  output: O;
};

export type BroadcastDef<P extends z.ZodTypeAny = z.ZodTypeAny> = {
  kind: "broadcast";
  channel: string;
  payload: P;
};

export type CallDef = InvokeDef | BroadcastDef;
export type Contract = Record<string, CallDef>;

export const invoke = <I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  channel: string,
  input: I,
  output: O,
): InvokeDef<I, O> => ({ kind: "invoke", channel, input, output });

export const broadcast = <P extends z.ZodTypeAny>(
  channel: string,
  payload: P,
): BroadcastDef<P> => ({ kind: "broadcast", channel, payload });
