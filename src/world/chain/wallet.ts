import { isAddress, isHex, type Hex } from "./codec";
import { SEPOLIA_PARAMS } from "./config";
import { RpcError, type Eip1193Provider } from "./rpc";

// The player's browser wallet. Wallets announce themselves (EIP-6963); older
// ones only set window.ethereum. The World asks for the account, asks the
// wallet to switch to Sepolia, and hands it transactions and permit
// signatures to show the player. It never sees a key.

export interface WalletOption {
  /** EIP-6963 rdns (such as io.metamask), or "injected" for window.ethereum. */
  id: string;
  name: string;
  /** A data: image URL the wallet gave, or null. */
  icon: string | null;
  provider: Eip1193Provider;
}

interface AnnounceDetail {
  info?: { uuid?: unknown; name?: unknown; icon?: unknown; rdns?: unknown };
  provider?: unknown;
}

const isProvider = (value: unknown): value is Eip1193Provider => !!value && typeof (value as Eip1193Provider).request === "function";

function cleanName(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
  return text ? text.slice(0, 40) : fallback;
}

/** Only raster or SVG images given as data: URLs; they are shown in an <img>, never as markup. */
function cleanIcon(value: unknown): string | null {
  return typeof value === "string" && /^data:image\/(png|svg\+xml|webp|jpeg|gif)[;,]/i.test(value) && value.length < 200_000 ? value : null;
}

function injectedName(provider: Record<string, unknown>): string {
  if (provider.isRabby) return "Rabby";
  if (provider.isOkxWallet || provider.isOKExWallet) return "OKX Wallet";
  if (provider.isCoinbaseWallet) return "Coinbase Wallet";
  if (provider.isBraveWallet) return "Brave Wallet";
  if (provider.isTokenPocket) return "TokenPocket";
  if (provider.isImToken) return "imToken";
  if (provider.isMetaMask) return "MetaMask";
  return "Browser wallet";
}

/** The wallets in this browser, after giving them `waitMs` to announce themselves. */
export function discoverWallets(target: Window = window, waitMs = 300): Promise<WalletOption[]> {
  return new Promise((resolve) => {
    const found = new Map<string, WalletOption>();
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<AnnounceDetail>).detail;
      if (!detail || !isProvider(detail.provider)) return;
      const info = detail.info ?? {};
      const id = typeof info.rdns === "string" && /^[a-z0-9.-]{3,80}$/i.test(info.rdns) ? info.rdns : typeof info.uuid === "string" ? info.uuid.slice(0, 64) : `wallet-${found.size}`;
      if (!found.has(id)) found.set(id, { id, name: cleanName(info.name, "Wallet"), icon: cleanIcon(info.icon), provider: detail.provider });
    };
    target.addEventListener("eip6963:announceProvider", onAnnounce);
    target.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      target.removeEventListener("eip6963:announceProvider", onAnnounce);
      const injected = (target as unknown as { ethereum?: unknown }).ethereum;
      const announced = [...found.values()];
      if (isProvider(injected) && !announced.some((w) => w.provider === injected)) {
        announced.push({ id: "injected", name: injectedName(injected as unknown as Record<string, unknown>), icon: null, provider: injected });
      }
      resolve(announced);
    }, waitMs);
  });
}

export interface TxRequest {
  to: Hex;
  data: Hex;
}

/** EIP-712 typed data, as eth_signTypedData_v4 takes it. */
export interface TypedData {
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
}

/** One connected wallet and the account the player picked in it. */
export class WalletSession {
  account: Hex | null = null;
  chainId: number | null = null;
  private readonly listeners: [string, (...args: never[]) => void][] = [];

  constructor(
    readonly option: WalletOption,
    private readonly onChange: () => void,
  ) {}

  get provider() {
    return this.option.provider;
  }

  /** Asks for the account; with `silent`, only takes one the wallet already allowed. */
  async connect(silent = false): Promise<Hex | null> {
    const accounts = await this.provider.request({ method: silent ? "eth_accounts" : "eth_requestAccounts", params: [] });
    const first = Array.isArray(accounts) ? accounts.find(isAddress) : undefined;
    this.account = first ? (first.toLowerCase() as Hex) : null;
    this.chainId = Number(await this.provider.request({ method: "eth_chainId", params: [] }));
    if (this.account && !this.listeners.length) this.listen();
    return this.account;
  }

  private listen() {
    const on = (event: string, listener: (...args: never[]) => void) => {
      if (typeof this.provider.on !== "function") return;
      this.provider.on(event, listener);
      this.listeners.push([event, listener]);
    };
    on("accountsChanged", ((accounts: unknown) => {
      const first = Array.isArray(accounts) ? accounts.find(isAddress) : undefined;
      this.account = first ? (first.toLowerCase() as Hex) : null;
      this.onChange();
    }) as (...args: never[]) => void);
    on("chainChanged", ((chainId: unknown) => {
      this.chainId = Number(chainId);
      this.onChange();
    }) as (...args: never[]) => void);
    on("disconnect", (() => {
      this.account = null;
      this.onChange();
    }) as (...args: never[]) => void);
  }

  /** Stops listening. Wallets that support it also drop the site's permission. */
  close(forget = false) {
    for (const [event, listener] of this.listeners.splice(0)) this.provider.removeListener?.(event, listener);
    if (forget) void this.provider.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }).catch(() => undefined);
    this.account = null;
  }

  /** Asks the wallet to switch to Sepolia, adding it first if the wallet doesn't know it. */
  async switchToSepolia(): Promise<void> {
    try {
      await this.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA_PARAMS.chainId }] });
    } catch (error) {
      const code = (error as { code?: number })?.code;
      const inner = (error as { data?: { originalError?: { code?: number } } })?.data?.originalError?.code;
      if (code !== 4902 && inner !== 4902) throw error;
      await this.provider.request({ method: "wallet_addEthereumChain", params: [SEPOLIA_PARAMS] });
    }
    this.chainId = Number(await this.provider.request({ method: "eth_chainId", params: [] }));
  }

  async send(tx: TxRequest): Promise<Hex> {
    if (!this.account) throw new RpcError("No account connected", null, null);
    const hash = await this.provider.request({ method: "eth_sendTransaction", params: [{ from: this.account, to: tx.to, data: tx.data }] });
    if (!isHex(hash) || hash.length !== 66) throw new RpcError("The wallet returned no transaction hash", null, null);
    return hash as Hex;
  }

  async signTypedData(data: TypedData): Promise<Hex> {
    if (!this.account) throw new RpcError("No account connected", null, null);
    const signature = await this.provider.request({ method: "eth_signTypedData_v4", params: [this.account, JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v))] });
    if (!isHex(signature) || signature.length !== 132) throw new RpcError("The wallet returned no signature", null, null);
    return signature as Hex;
  }
}

/** v, r and s of a 65-byte signature. */
export function splitSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
  const r = `0x${signature.slice(2, 66)}` as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  let v = parseInt(signature.slice(130, 132), 16);
  if (v < 27) v += 27;
  return { v, r, s };
}
