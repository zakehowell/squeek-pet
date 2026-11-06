# Squeek Pet World contracts (Sepolia testnet)

The on-chain part of [Squeek Pet World](../README.md#squeek-pet-world). Players connect a wallet, stake testnet SQK to earn SQB from the real hamster's settled work, and spend both in the World. Each turn of the game itself stays free and off-chain; only assets and the economy are on Sepolia.

| Contract | What it does | Owner |
| --- | --- | --- |
| `SqbToken` | SQB, the World's ERC-20 with EIP-2612 permits. Zero premine: supply starts at 0 and only the minter can mint. Spending burns it. | The deployer. It sets the first minter once; a later minter change waits 48 hours in public. It can never mint. |
| `SqbMinter` | Stake the official SQK, earn SQB. Every 10 work units the official SqueekCore settles become 1 SQB, streamed over 24 hours to stakers in proportion to their stake. At most `maxWorkPerRound` per settled round; a regression, odd reply or a SqueekCore upgrade pauses minting. | The deployer. It can only pause and resume minting (resuming skips the paused gap) and return tokens sent by mistake, never staked SQK. |
| `WorldShop` | Home deeds (ERC-721, paid in SQK, +1% per sale, capped), renovations and seasonal decorations (SQB), founding a guild (SQK, limited per season), free guild membership per season, and guild-war supplies (SQB, 10 boss damage each). Every payment is burned; there is no treasury. | None. Prices are fixed at deployment. |
| `SqkFaucet` | Gives testnet SQK to wallets holding less than a set amount, once per cooldown, so players without SQK can try the World. | The deployer. It can change the amounts and take back what's left. |

The official contracts it uses (release `core-sepolia-20261103`): SqueekCore `0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4` and SQK `0xd78a3956cf63164d1fa1c622ad3c66623162fa1e`.

## Deploying to Sepolia

Deploy from your own wallet with the deploy page. The page holds no key: each transaction appears in your wallet, and nothing is sent anywhere else.

1. In the repository root: `npm install`, then `npm run deploy:page`.
2. Open `http://127.0.0.1:1420/contracts/deploy/` in the browser that has your wallet (MetaMask or another EIP-1193 wallet) and connect. The page switches the wallet to Sepolia.
3. Check the settings. They are the whitepaper's numbers: first deed 10,000 SQK, 100 deeds, renovations 500 and 1,500 SQB, founding a guild 50,000 SQK with 8 per season, decorations 50 SQB, and a faucet giving 1,000 SQK a day to wallets holding less than 1,000, filled with 20,000 SQK from your wallet. Season 1 is fixed at 2026-11-02 12:00 UTC, where the World counts its seasons from.
4. Press **Deploy** and confirm six times in your wallet: the SQB token, the minter, letting the minter mint (once), the shop, the faucet, and the SQK for the faucet. If the page is closed or reloaded it continues where it stopped, and a transaction still waiting for a block is waited for, not sent again.
5. The page then checks the deployed contracts and shows the **World config**. Copy it into the World page on squeekpulse.xyz (`mountWorld(element, { language, chain })`). Until the site has it, the World stays read-only.

You need a little Sepolia ETH for gas: the six transactions used 8.08 million gas on a fork of Sepolia (shop 4.0 M, minter 1.9 M, token 1.3 M, faucet 0.76 M, the two calls about 0.1 M). You need the SQK you put in the faucet; put in 0 to fill it later by sending SQK to its address.

## Developing

```bash
npm ci                 # in contracts/
npm test               # the contracts' tests, on Hardhat's own chain
npm run test:fork      # against the real SqueekCore and SQK, on a fork of Sepolia
npm run export         # compile, then write ../src/world/chain/abi.ts and deploy/contracts.js
```

`npm run export` regenerates what the World and the deploy page use from the compiled contracts; `test/export.spec.cjs` fails while they are out of date.

To play the on-chain World locally, on a fork of Sepolia:

```bash
npm run node:fork      # terminal 1, in contracts/: a local node forking Sepolia
npm run local:deploy   # terminal 2, in contracts/: deploys here, writes deploy/local.json
npm run dev            # terminal 3, in the repository root
```

Then open `http://127.0.0.1:1420/world.html?chain=local` and connect a wallet to `http://127.0.0.1:8545` with chain id 11155111, using one of Hardhat's published test accounts. `local:deploy` fills the faucet from the official SqueekStaking contract, which only a local fork can do. The deploy page works against the fork too: add `?rpc=http://127.0.0.1:8545` so its config points at the local node.

The fork starts at block 12,075,053, just before a real settlement that carried work (round 356 → 357), so the fork test can replay it and mint SQB from real numbers. `SQUEEK_FORK_URL` and `SQUEEK_FORK_BLOCK` change the RPC and the block; the RPC must serve historical state.

## Layout

```
src/             the four contracts, their interfaces to SqueekCore and the tokens, and test mocks
test/            Hardhat tests, the fork test, and the check that the exports are current
scripts/         export.cjs (ABI and bytecode for the World and the deploy page), local-world.cjs (local fork)
deploy/          the deploy page (index.html, deploy.ts, plan.ts, text.ts) and contracts.js
```
