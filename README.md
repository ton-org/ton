# TON JS Client

[![Version npm](https://img.shields.io/npm/v/ton.svg?logo=npm)](https://www.npmjs.com/package/ton)

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

To use this library you need HTTP API endpoint, you can use one of the public endpoints:

- Mainnet: https://toncenter.com/api/v2/jsonRPC
- Testnet: https://testnet.toncenter.com/api/v2/jsonRPC

```js
import { TonClient, WalletContractV4, internal } from "@ton/ton";
import { mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";

// Create Client
const client = new TonClient({
  endpoint: 'https://toncenter.com/api/v2/jsonRPC',
});

// Generate new key
let mnemonics = await mnemonicNew();
let keyPair = await mnemonicToPrivateKey(mnemonics);

// Create wallet contract
let workchain = 0; // Usually you need a workchain 0
let wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
let contract = client.open(wallet);

// Get balance
let balance: bigint = await contract.getBalance();

// Create a transfer
let seqno: number = await contract.getSeqno();
let transfer = await contract.createTransfer({
  seqno,
  secretKey: keyPair.secretKey,
  messages: [internal({
    value: '1.5',
    to: 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
    body: 'Hello world',
  })]
});

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
