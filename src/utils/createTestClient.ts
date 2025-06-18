/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as dotenv from "dotenv";
dotenv.config();

import { TonClient } from "../client/TonClient";
import { createDelayAdapter } from "./delayAdapter";

const FREE_RPC_DELAY = 1000;
const KEY_RPC_DELAY = 100;

const DEFAULT_MAINNET_ENDPOINT = "https://toncenter.com/api/v2/jsonRPC";
const DEFAULT_TESTNET_ENDPOINT = "https://testnet.toncenter.com/api/v2/jsonRPC";
// TonHub API Key, it has been there initially (supposedly for testing purposes)
const DEFAULT_API_KEY =
  "32df40f4ffc11053334bcdf09c7d3a9e6487ee0cb715edf8cf667c543edb10ca";

const MAINNET_ENDPOINT =
  process.env.MAINNET_ENDPOINT ?? DEFAULT_MAINNET_ENDPOINT;
const TESTNET_ENDPOINT =
  process.env.TESTNET_ENDPOINT ?? DEFAULT_TESTNET_ENDPOINT;
const API_KEY = process.env.API_KEY ?? DEFAULT_API_KEY;

export function createTestClient(net?: "testnet" | "mainnet") {
  const endpoint = net === "mainnet" ? MAINNET_ENDPOINT : TESTNET_ENDPOINT;
  const apiKey = net !== "mainnet" || process.env.API_KEY ? API_KEY : undefined;
  return new TonClient({
    endpoint,
    apiKey,
    httpAdapter: createDelayAdapter(
      apiKey && apiKey !== DEFAULT_API_KEY ? KEY_RPC_DELAY : FREE_RPC_DELAY
    ),
  });
}
