# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [15.2.1] - 2025-02-07

## Fixed
- `TonClient` `extra_currencies` field is now optional

## [15.2.0] - 2025-01-31

## Added
- Extracurrencies support (thx @Trinketer22)

## [15.1.0] - 2024-10-09 

This update requires `@ton/core` >0.59.0

## Fixed 
- `TonClient4` and `TonClient` providers restrict using method id as number
- Updated typescript to 5.6.3

## [15.0.0] - 2024-08-16
- Make spelling consistent for wallets

## [14.0.0] - 2024-07-16

## Added
- Added V5 wallet support (thx Tonkeeper Team)
- Fixed stack serialization for TonCenter v2 client (thx @aspite)

## Fixed 
- Types for different wallet versions

## [13.11.2] - 2024-05-31

## Added
- Ability to pass interceptor for TonClientV4 API calls

## Fixed
- TonClient minor type issues

## [13.11.1] - 2024-02-26

## Fixed
- Added xports for `HttpApiParameters`/`TonClientParameters`
- Added `TonClient.getTransactions` missing `archival` parameter
- Updated packages

## [13.11.0] - 2024-02-23

This update requires `@ton/core` >0.56.0

## Fixed 
- Updated `TonClient4` and `TonClient` to match contract providers at `@ton/core@0.56.0`

## [13.10.0] - 2024-02-06

## Added
- Locate tx methods in `TonClient` (thx @krigga)

## Fixed
- Vue.js compilation (thx @d0rich)
- Allow to use `HttpApi` property in `TonClient` inheritants (thx @ernieyang09)

## [13.9.0] - 2023-10-25

## Removed
- `WalletV5` contract due to the unreadiness

## [13.8.0] - 2023-10-24

## Added
- `TonClient4.getAccountTransactionsParsed` method (thanks @vzhovnitsky)
- `WalletV5` contract (thanks @siandreev)
- blockchain fees estimation via `computeStorageFees`/`computeExternalMessageFees`/`computeGasPrices`/`computeMessageForwardFees` (thanks @vzhovnitsky)

## Fixed
- Uri encode get method name for `TonClient4` (thanks @krigga)
- Improved `parseStackItem` due to toncenter.com bug


## [13.7.0] - 2023-09-18

## Added
- `sendOrderWithoutSecretKey` method to `MultisigWallet`

## Fixed
- Uri encode get method name for `TonClient4`

## [13.6.1] - 2023-08-24

## Fixed
- `TonClient.getAccountTransactions` return type

## [13.6.0] - 2023-08-17
## Added
- `ElectorContract`
- `parseFullConfig` and config params parsing methods

## [13.5.1] - 2023-07-14
## Changed
- Migrated to `@ton/crypto` package instead of `ton-crypto`
- Migrated to `@ton/core` instead of `ton-core`
- Migrated to `@ton/emulator` instead of `ton-emulator`
- Renamed package to `@ton/ton`


## [13.5.0] - 2023-05-10
## Fixed
- Replaced `io-ts` with `zod` to reduce web bundle size
- Removed unimplemented method `getOneTransaction` from `TonClient4`

## [13.4.1] - 2023-03-02

## Added
- call get method aliases for TonClient (#7)
- add isContractDeployed to TonClient4 (#6)

## Fixed
- Updated `ton-core` to depend from 0.48.0
- Fixed typos in `SendMode`

## [13.4.0] - 2023-03-01

## Added
- `MultisigWallet`, `MultisigOrder` and `MultisigOrderBuilder`

## [13.3.0] - 2023-01-05

## Added
- `getTransaction` to `TonClient4` to get a single transaction by id

## [13.2.0] - 2022-12-31

## Changed
- Updaded `ton-core` and renambed `AccountState` to `ContractState`
- Replaced internal usafe of a `openContract` with `ton-core` one

## [13.1.0] - 2022-12-31

## Changed
- Upgraded `ton-core` and removed legacy usage of `Message` type

## [13.0.0] - 2022-12-29

## Changed
- Large refactoring, removing a lot of obsolete features and replacing low level classes like `Cell` with `ton-core` implementation
- New way to work with contracts
- Explicit work with wallet contracts
- Unify stack operations in `TonClient` and `TonClient4`
- Merged `TupleSlice` and `TupleSlice4` into `TupleReader` from `ton-core`

## Removed
- Removed magical `Wallet` operations

## [12.3.3] - 2022-12-22
# Changed
- Improved BOC serialization

## [12.3.2]
- Fix unicode symbols in `readString` function

## [10.4.0]
- `TonClient4` - client for new API

## [10.0.0]-[10.3.0]
- Exotic Cells parsing
- `readBitString`
- VM Stack parsing

## [9.2.0]
- Builder and dict builder

## [9.1.0]
- Support for API token

## [9.0.0]
- Synchronous Cell's `hash` and a lot of related functions like `contractAddress`.

## [6.10.0]
- Better compatibility with webpack

## [6.8.0]
- Allow large comments

## [6.7.0]
- Exported all parsing methods and `contractAddress`

## [6.6.0]
- ADNL address

## [6.5.2]
- Improve Internal/External messages typings

## [6.5.0-6.5.1]
- Ability to include first transaction in getTransactions method

## [6.4.0]
- Better webpack support

## [6.3.0]

- Added dictionary serialization
- Added `equals` to Cell

## [6.1.0-6.2.1]

- Added parsing of int (as addition to uint) in `BitStreamReader` and `Slice`

## [6.0.0]

- [BREAKING] Change `RawMessage` to `CellMessage` and use `RawMessage` in parseTransaction
- Improve parseTransaction typings. Added:
    - RawAccountStatus
    - RawCurrencyCollection
    - RawCommonMessageInfo
    - RawStateInit
    - RawMessage
    - RawHashUpdate
    - RawAccountStatusChange
    - RawStorageUsedShort
    - RawStoragePhase
    - RawComputePhase
    - RawActionPhase
    - RawBouncePhase
    - RawTransactionDescription
    - RawTransaction
