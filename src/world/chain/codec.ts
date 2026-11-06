// A small Solidity ABI codec for the calls the World makes: static and dynamic
// types, tuples and arrays, the way the Solidity ABI spec lays them out. Values
// read from a node are untrusted, so decoding checks every offset and length
// against the data it was given.

export interface AbiParam {
  readonly name: string;
  readonly type: string;
  readonly components?: readonly AbiParam[];
}

export interface AbiFunction {
  readonly selector: string;
  readonly inputs: readonly AbiParam[];
  readonly outputs: readonly AbiParam[];
}

export interface AbiError {
  readonly name: string;
  readonly inputs: readonly AbiParam[];
}

export type Hex = `0x${string}`;

export class AbiDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbiDecodeError";
  }
}

const WORD = 32;
const MAX_ITEMS = 10_000;
const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

// ---- Hex ------------------------------------------------------------------------

export function isHex(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]*$/.test(value) && value.length % 2 === 0;
}

export function isAddress(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function hexToBytes(hex: string): Uint8Array {
  if (!isHex(hex)) throw new AbiDecodeError("not hex data");
  const out = new Uint8Array((hex.length - 2) / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): Hex {
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out as Hex;
}

// ---- Types ----------------------------------------------------------------------

interface Parsed {
  kind: "uint" | "int" | "address" | "bool" | "bytesN" | "bytes" | "string" | "tuple" | "array";
  bits?: number;
  size?: number;
  /** Array element, with its length (null for T[]). */
  item?: AbiParam;
  length?: number | null;
}

function parse(param: AbiParam): Parsed {
  const t = param.type;
  const array = /^(.*)\[(\d*)\]$/.exec(t);
  if (array) return { kind: "array", item: { ...param, type: array[1] }, length: array[2] === "" ? null : Number(array[2]) };
  if (t === "tuple") return { kind: "tuple" };
  if (t === "address") return { kind: "address" };
  if (t === "bool") return { kind: "bool" };
  if (t === "string") return { kind: "string" };
  if (t === "bytes") return { kind: "bytes" };
  const int = /^(u?)int(\d*)$/.exec(t);
  if (int) return { kind: int[1] ? "uint" : "int", bits: int[2] ? Number(int[2]) : 256 };
  const fixed = /^bytes(\d+)$/.exec(t);
  if (fixed) return { kind: "bytesN", size: Number(fixed[1]) };
  throw new Error(`unsupported ABI type ${t}`);
}

function isDynamic(param: AbiParam): boolean {
  const p = parse(param);
  if (p.kind === "string" || p.kind === "bytes") return true;
  if (p.kind === "array") return p.length === null || isDynamic(p.item!);
  if (p.kind === "tuple") return (param.components ?? []).some(isDynamic);
  return false;
}

/** Bytes a static type takes in place. */
function staticSize(param: AbiParam): number {
  if (isDynamic(param)) return WORD;
  const p = parse(param);
  if (p.kind === "tuple") return (param.components ?? []).reduce((sum, c) => sum + staticSize(c), 0);
  if (p.kind === "array") return p.length! * staticSize(p.item!);
  return WORD;
}

// ---- Encoding -------------------------------------------------------------------

function word(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^(0x[0-9a-fA-F]+|-?\d+)$/.test(value)) return BigInt(value);
  if (typeof value === "boolean") return value ? 1n : 0n;
  throw new Error(`not an integer: ${String(value)}`);
}

function padRight(hex: string): string {
  const rest = hex.length % 64;
  return rest ? hex + "0".repeat(64 - rest) : hex;
}

function encodeValue(param: AbiParam, value: unknown): string {
  const p = parse(param);
  switch (p.kind) {
    case "uint": {
      const n = toBigInt(value);
      if (n < 0n || n >= 1n << BigInt(p.bits!)) throw new Error(`${param.type} out of range: ${n}`);
      return word(n);
    }
    case "int": {
      const n = toBigInt(value);
      const half = 1n << BigInt(p.bits! - 1);
      if (n < -half || n >= half) throw new Error(`${param.type} out of range: ${n}`);
      return word(n < 0n ? (1n << 256n) + n : n);
    }
    case "address":
      if (!isAddress(value)) throw new Error(`not an address: ${String(value)}`);
      return value.slice(2).toLowerCase().padStart(64, "0");
    case "bool":
      return word(value ? 1n : 0n);
    case "bytesN": {
      const bytes = typeof value === "string" ? hexToBytes(value) : (value as Uint8Array);
      if (bytes.length !== p.size) throw new Error(`${param.type} needs ${p.size} bytes`);
      return padRight(bytesToHex(bytes).slice(2));
    }
    case "bytes":
    case "string": {
      const bytes = p.kind === "string" ? utf8.encode(String(value)) : typeof value === "string" ? hexToBytes(value) : (value as Uint8Array);
      return word(BigInt(bytes.length)) + padRight(bytesToHex(bytes).slice(2));
    }
    case "tuple": {
      const components = param.components ?? [];
      const values = Array.isArray(value) ? value : components.map((c) => (value as Record<string, unknown>)[c.name]);
      return encodeList(components, values);
    }
    case "array": {
      const items = value as readonly unknown[];
      if (!Array.isArray(items)) throw new Error(`${param.type} needs an array`);
      if (p.length !== null && items.length !== p.length) throw new Error(`${param.type} needs ${p.length} items`);
      const body = encodeList(
        items.map(() => p.item!),
        items,
      );
      return p.length === null ? word(BigInt(items.length)) + body : body;
    }
  }
}

function encodeList(params: readonly AbiParam[], values: readonly unknown[]): string {
  if (params.length !== values.length) throw new Error(`expected ${params.length} values, got ${values.length}`);
  const headSize = params.reduce((sum, p) => sum + staticSize(p), 0);
  let head = "";
  let tail = "";
  params.forEach((param, i) => {
    const encoded = encodeValue(param, values[i]);
    if (isDynamic(param)) {
      head += word(BigInt(headSize + tail.length / 2));
      tail += encoded;
    } else head += encoded;
  });
  return head + tail;
}

/** The call data for `fn` with `args`. */
export function encodeCall(fn: AbiFunction, args: readonly unknown[] = []): Hex {
  return `${fn.selector}${encodeList(fn.inputs, args)}` as Hex;
}

export function encodeParams(params: readonly AbiParam[], values: readonly unknown[]): Hex {
  return `0x${encodeList(params, values)}` as Hex;
}

// ---- Decoding -------------------------------------------------------------------

function readWord(data: Uint8Array, at: number): bigint {
  if (at < 0 || at + WORD > data.length) throw new AbiDecodeError("data too short");
  let n = 0n;
  for (let i = at; i < at + WORD; i++) n = (n << 8n) | BigInt(data[i]);
  return n;
}

function readOffset(data: Uint8Array, at: number, base: number): number {
  const offset = readWord(data, at);
  if (offset > BigInt(data.length)) throw new AbiDecodeError("offset out of range");
  const target = base + Number(offset);
  if (target > data.length) throw new AbiDecodeError("offset out of range");
  return target;
}

function readLength(data: Uint8Array, at: number, unit: number): number {
  const length = readWord(data, at);
  const room = BigInt(Math.max(0, data.length - at - WORD));
  if (length > BigInt(MAX_ITEMS) * BigInt(WORD) || (unit > 0 && length * BigInt(unit) > room)) throw new AbiDecodeError("length out of range");
  return Number(length);
}

function decodeAt(param: AbiParam, data: Uint8Array, at: number): unknown {
  const p = parse(param);
  switch (p.kind) {
    case "uint": {
      const n = readWord(data, at);
      if (p.bits! < 256 && n >> BigInt(p.bits!) !== 0n) throw new AbiDecodeError(`${param.type} out of range`);
      return n;
    }
    case "int": {
      const raw = readWord(data, at);
      const n = raw >> 255n ? raw - (1n << 256n) : raw;
      const half = 1n << BigInt(p.bits! - 1);
      if (n < -half || n >= half) throw new AbiDecodeError(`${param.type} out of range`);
      return n;
    }
    case "address": {
      const n = readWord(data, at);
      if (n >> 160n !== 0n) throw new AbiDecodeError("address out of range");
      return `0x${n.toString(16).padStart(40, "0")}`;
    }
    case "bool": {
      const n = readWord(data, at);
      if (n > 1n) throw new AbiDecodeError("bool out of range");
      return n === 1n;
    }
    case "bytesN":
      readWord(data, at);
      return bytesToHex(data.slice(at, at + p.size!));
    case "bytes":
    case "string": {
      const length = readLength(data, at, 1);
      const bytes = data.slice(at + WORD, at + WORD + length);
      return p.kind === "string" ? fromUtf8.decode(bytes) : bytesToHex(bytes);
    }
    case "tuple": {
      const components = param.components ?? [];
      const values = decodeList(components, data, at);
      return components.length && components.every((c) => c.name) ? Object.fromEntries(components.map((c, i) => [c.name, values[i]])) : values;
    }
    case "array": {
      const item = p.item!;
      if (p.length === null) {
        const length = readLength(data, at, WORD);
        return decodeList(Array.from({ length }, () => item), data, at + WORD);
      }
      return decodeList(Array.from({ length: p.length! }, () => item), data, at);
    }
  }
}

function decodeList(params: readonly AbiParam[], data: Uint8Array, base: number): unknown[] {
  if (params.length > MAX_ITEMS) throw new AbiDecodeError("too many items");
  let at = base;
  return params.map((param) => {
    const value = isDynamic(param) ? decodeAt(param, data, readOffset(data, at, base)) : decodeAt(param, data, at);
    at += staticSize(param);
    return value;
  });
}

export function decodeParams(params: readonly AbiParam[], hex: string): unknown[] {
  return decodeList(params, hexToBytes(hex), 0);
}

/** A call's return value: the single output itself, or the outputs as a list. */
export function decodeResult(fn: AbiFunction, hex: string): unknown {
  const values = decodeParams(fn.outputs, hex);
  return fn.outputs.length === 1 ? values[0] : values;
}

/** A revert's custom error, if `hex` is one of `errors`. */
export function decodeError(errors: Record<string, AbiError>, hex: string): { name: string; args: unknown[] } | null {
  if (!isHex(hex) || hex.length < 10) return null;
  const spec = errors[hex.slice(0, 10).toLowerCase()];
  if (!spec) return null;
  try {
    return { name: spec.name, args: decodeParams(spec.inputs, `0x${hex.slice(10)}`) };
  } catch {
    return { name: spec.name, args: [] };
  }
}
