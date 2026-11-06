import { AbiCoder, Interface, id } from "ethers";
import { describe, expect, it } from "vitest";
import { FUNCTIONS, ERRORS } from "../src/world/chain/abi";
import { AbiDecodeError, decodeError, decodeParams, decodeResult, encodeCall, encodeParams, type AbiParam } from "../src/world/chain/codec";

// The World's ABI codec, checked against ethers' on the same values.

const coder = AbiCoder.defaultAbiCoder();

/** ethers' type string for a parameter, with tuples spelled out. */
function typeOf(p: AbiParam): string {
  if (p.type.startsWith("tuple")) return `(${(p.components ?? []).map(typeOf).join(",")})${p.type.slice(5)}`;
  return p.type;
}

const DEED: AbiParam = {
  name: "deeds",
  type: "tuple[]",
  components: [
    { name: "owner", type: "address" },
    { name: "level", type: "uint8" },
    { name: "name", type: "string" },
  ],
};

const CASES: { params: AbiParam[]; values: unknown[] }[] = [
  { params: [{ name: "a", type: "uint256" }], values: [123n] },
  { params: [{ name: "a", type: "uint256" }, { name: "b", type: "address" }, { name: "c", type: "bool" }], values: [2n ** 255n + 7n, "0x00000000000000000000000000000000000000aa", true] },
  { params: [{ name: "s", type: "string" }], values: ["仓鼠的向日葵田 <b>&amp;</b>"] },
  { params: [{ name: "s", type: "string" }, { name: "n", type: "uint8" }, { name: "t", type: "string" }], values: ["", 7n, "x".repeat(70)] },
  { params: [{ name: "b", type: "bytes" }, { name: "f", type: "bytes1" }, { name: "h", type: "bytes32" }], values: ["0x0102030405", "0x0f", `0x${"ab".repeat(32)}`] },
  { params: [{ name: "i", type: "int256" }, { name: "j", type: "int8" }], values: [-5n, -128n] },
  { params: [{ name: "list", type: "uint256[]" }], values: [[1n, 2n, 3n]] },
  { params: [{ name: "list", type: "string[]" }], values: [["a", "", "长一点的名字"]] },
  { params: [{ name: "pair", type: "uint256[2]" }, { name: "x", type: "address" }], values: [[9n, 10n], "0x1111111111111111111111111111111111111111"] },
  { params: [DEED], values: [[["0x2222222222222222222222222222222222222222", 3n, "Bob's plot"], ["0x3333333333333333333333333333333333333333", 1n, ""]]] },
  { params: [DEED], values: [[]] },
];

function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)) return value.toLowerCase();
  if (value && typeof value === "object") return Object.values(value).map(plain);
  return value;
}

describe("the World's ABI codec", () => {
  it("encodes exactly as ethers does", () => {
    for (const { params, values } of CASES) {
      expect(encodeParams(params, values)).toBe(coder.encode(params.map(typeOf), values));
    }
  });

  it("decodes what ethers encodes", () => {
    for (const { params, values } of CASES) {
      const hex = coder.encode(params.map(typeOf), values);
      expect(plain(decodeParams(params, hex))).toEqual(plain(values));
    }
  });

  it("names tuple fields and returns a single output by itself", () => {
    const fn = { selector: "0x00000000", inputs: [], outputs: [DEED] };
    const hex = coder.encode([typeOf(DEED)], [[["0x2222222222222222222222222222222222222222", 2n, "Plot"]]]);
    expect(decodeResult(fn, hex)).toEqual([{ owner: "0x2222222222222222222222222222222222222222", level: 2n, name: "Plot" }]);
  });

  it("rejects data that points outside itself or claims huge lengths", () => {
    const string: AbiParam[] = [{ name: "s", type: "string" }];
    const word = (n: bigint) => n.toString(16).padStart(64, "0");
    expect(() => decodeParams(string, `0x${word(2n ** 200n)}`)).toThrow(AbiDecodeError);
    expect(() => decodeParams(string, `0x${word(32n)}${word(2n ** 64n)}`)).toThrow(AbiDecodeError);
    expect(() => decodeParams([{ name: "l", type: "uint256[]" }], `0x${word(32n)}${word(1000n)}${word(1n)}`)).toThrow(AbiDecodeError);
    expect(() => decodeParams([{ name: "a", type: "address" }], `0x${"f".repeat(64)}`)).toThrow(AbiDecodeError);
    expect(() => decodeParams([{ name: "a", type: "uint8" }], `0x${word(256n)}`)).toThrow(AbiDecodeError);
    expect(() => decodeParams([{ name: "a", type: "uint256" }], "0x1234")).toThrow(AbiDecodeError);
    expect(() => decodeParams([{ name: "a", type: "uint256" }], "nope")).toThrow(AbiDecodeError);
  });

  it("uses the selectors the contracts were compiled with", () => {
    const fragments: string[] = [];
    for (const [contract, functions] of Object.entries(FUNCTIONS)) {
      for (const [name, fn] of Object.entries(functions)) {
        const signature = `${name}(${fn.inputs.map(typeOf).join(",")})`;
        expect(fn.selector, `${contract}.${signature}`).toBe(id(signature).slice(0, 10));
        fragments.push(`function ${signature}`);
      }
    }
    expect(fragments.length).toBeGreaterThan(30);
  });

  it("builds call data ethers agrees with", () => {
    const shop = new Interface(["function foundGuildWithPermit(string,uint8,uint8,uint256,uint256,uint8,bytes32,bytes32)", "function joinGuild(uint256,uint256)"]);
    const r = `0x${"11".repeat(32)}`;
    const s = `0x${"22".repeat(32)}`;
    expect(encodeCall(FUNCTIONS.WorldShop.foundGuildWithPermit, ["夜猫子", 3, 1, 2, 999, 27, r, s])).toBe(shop.encodeFunctionData("foundGuildWithPermit", ["夜猫子", 3, 1, 2, 999, 27, r, s]));
    expect(encodeCall(FUNCTIONS.WorldShop.joinGuild, [5n, 2n])).toBe(shop.encodeFunctionData("joinGuild", [5, 2]));
  });

  it("decodes the contracts' custom errors and Solidity's own", () => {
    const shop = new Interface(["error PriceAbove(uint256 price, uint256 maxPrice)", "error Error(string)"]);
    const data = shop.encodeErrorResult("PriceAbove", [10_100n, 10_000n]);
    expect(decodeError(ERRORS, data)).toEqual({ name: "PriceAbove", args: [10_100n, 10_000n] });
    expect(decodeError(ERRORS, `0x08c379a0${coder.encode(["string"], ["nope"]).slice(2)}`)).toEqual({ name: "Error", args: ["nope"] });
    expect(decodeError(ERRORS, "0xdeadbeef")).toBeNull();
    expect(decodeError(ERRORS, "0x")).toBeNull();
    expect(ERRORS[id("NotMinter()").slice(0, 10)]?.name).toBe("NotMinter");
  });
});
