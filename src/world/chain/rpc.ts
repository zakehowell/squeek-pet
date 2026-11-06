import { isHex, type Hex } from "./codec";

// JSON-RPC for the World: reads go to a public Sepolia node (and to the
// player's wallet if that node can't be reached); transactions and signatures
// only ever go to the wallet, which asks the player each time.

export interface RequestArgs {
  method: string;
  params?: readonly unknown[] | Record<string, unknown>;
}

/** An EIP-1193 provider: a wallet's, or our own over HTTP. */
export interface Eip1193Provider {
  request(args: RequestArgs): Promise<unknown>;
  on?(event: string, listener: (...args: never[]) => void): unknown;
  removeListener?(event: string, listener: (...args: never[]) => void): unknown;
}

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    /** Revert data, when the node or wallet passed it on. */
    readonly data: Hex | null,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

/** The player said no in their wallet (EIP-1193 code 4001). */
export const isRejection = (error: unknown) => {
  const code = (error as { code?: unknown })?.code;
  return code === 4001 || code === "ACTION_REJECTED" || /user (rejected|denied)/i.test(String((error as Error)?.message ?? ""));
};

/** Revert data from the many shapes wallets and nodes wrap it in. */
export function revertData(error: unknown, depth = 0): Hex | null {
  if (!error || typeof error !== "object" || depth > 4) return null;
  const e = error as Record<string, unknown>;
  if (error instanceof RpcError && error.data) return error.data;
  if (isHex(e.data) && (e.data as string).length >= 10) return e.data as Hex;
  for (const key of ["data", "error", "cause", "originalError"]) {
    const inner = revertData(e[key], depth + 1);
    if (inner) return inner;
  }
  return null;
}

let nextId = 1;

/** A provider that speaks JSON-RPC over HTTPS to `url`. */
export function httpProvider(url: string, fetchImpl: typeof fetch = (input, init) => fetch(input, init), timeoutMs = 15_000): Eip1193Provider {
  return {
    async request({ method, params = [] }) {
      const controller = typeof AbortController === "undefined" ? null : new AbortController();
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      try {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
          credentials: "omit",
          cache: "no-store",
          signal: controller?.signal,
        });
        if (!response.ok) throw new RpcError(`HTTP ${response.status} from the Sepolia node`, null, null);
        const body = (await response.json()) as { result?: unknown; error?: { code?: number; message?: string; data?: unknown } };
        if (body.error) {
          const data = body.error.data;
          throw new RpcError(String(body.error.message ?? "RPC error"), typeof body.error.code === "number" ? body.error.code : null, isHex(data) ? data : null);
        }
        return body.result;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}

/** A revert reported by a node: execution failed, rather than the request. */
function isRevert(error: unknown): boolean {
  if (revertData(error)) return true;
  const code = (error as { code?: unknown })?.code;
  return code === 3 || /revert/i.test(String((error as Error)?.message ?? ""));
}

export interface Receipt {
  status: "success" | "reverted";
  blockNumber: number;
}

/** Reads from the first provider that answers; a revert is an answer. */
export class Reader {
  constructor(private readonly providers: () => readonly Eip1193Provider[]) {}

  async request(method: string, params: readonly unknown[]): Promise<unknown> {
    let last: unknown = new RpcError("No Sepolia node to read from", null, null);
    for (const provider of this.providers()) {
      try {
        return await provider.request({ method, params });
      } catch (error) {
        if (isRevert(error)) throw error;
        last = error;
      }
    }
    throw last;
  }

  async call(to: Hex, data: Hex, from?: Hex | null): Promise<Hex> {
    const result = await this.request("eth_call", [{ to, data, ...(from ? { from } : {}) }, "latest"]);
    if (!isHex(result)) throw new RpcError("eth_call returned no data", null, null);
    return result;
  }

  async chainId(): Promise<number> {
    return Number(await this.request("eth_chainId", []));
  }

  /** The latest block's time, Unix seconds: the chain's clock, whatever this computer's says. */
  async blockTime(): Promise<number> {
    const block = (await this.request("eth_getBlockByNumber", ["latest", false])) as { timestamp?: string } | null;
    const time = Number(block?.timestamp);
    if (!Number.isFinite(time) || time <= 0) throw new RpcError("No latest block", null, null);
    return time;
  }

  async balance(address: Hex): Promise<bigint> {
    return BigInt(String(await this.request("eth_getBalance", [address, "latest"])));
  }

  async receipt(hash: Hex): Promise<Receipt | null> {
    const r = (await this.request("eth_getTransactionReceipt", [hash])) as { status?: string; blockNumber?: string } | null;
    if (!r || !r.blockNumber) return null;
    return { status: r.status === "0x1" ? "success" : "reverted", blockNumber: Number(r.blockNumber) };
  }
}
