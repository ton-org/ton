# TON JS Client

[![Version npm](https://img.shields.io/npm/v/@ton/ton.svg?logo=npm)](https://www.npmjs.com/package/@ton/ton)

Cross-platform client for TON blockchain.

## Features

- 🚀 Create new wallets
- 🍰 Get balance
- ✈️ Transfers

## Install

```bash
yarn add @ton/ton @ton/crypto @ton/core buffer
```

#### Browser polyfill

```js
// Add before using library
require("buffer");
```

## Usage

### Read an account balance

This example reads a public account on mainnet and prints its balance in TON.
It only needs the account address.

```ts
import { Address, fromNano, TonClient } from "@ton/ton";

const client = new TonClient({
  endpoint: "https://toncenter.com/api/v2/jsonRPC",
});
const address = Address.parse("EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N");
const balance = await client.getBalance(address);
console.log(fromNano(balance), "TON");
```

For a testnet account, use `https://testnet.toncenter.com/api/v2/jsonRPC`.

### Try a wallet transfer locally

The [Wallet V4 test](src/wallets/v4/WalletContractV4.spec.ts) funds a fresh wallet in
TON Sandbox, signs its first transfer and checks that the recipient receives both
messages. Run it from this repository after `yarn install`:

```sh
yarn test --runInBand --runTestsByPath src/wallets/v4/WalletContractV4.spec.ts -t "first transfer"
```

## Formatting

We use `biome` as our formatter. It's prettier compatible and fast

IDE Setup: [VSCode](https://marketplace.visualstudio.com/items?itemName=biomejs.biome), [Zed](https://biomejs.dev/reference/zed/)

```sh
yarn run format
```

## Testing

### Debugging in tests

By default tests are running using multiple worker threads. It's faster, but
undesirable during debugging. `SINGLETHREADED` env variable covers this case

```sh
SINGLETHREADED=1 yarn run test
```

### Coverage report

We use test coverage to eliminate blind spots in our tests.

#### How to?

The goal is to make all functions runned at least once

1. Build a coverage report

```sh
yarn run coverage
```

2. Coverage report is build to the `/coverage` directory

3. Open `/coverage/index.html` to check the report

## Acknowledgements

This library is developed by the [Whales Corp.](https://tonwhales.com/) and maintained by [Dan Volkov](https://github.com/dvlkv).

## License

MIT
