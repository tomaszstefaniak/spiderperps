# HL Copy (mobile)

Follow top Hyperliquid traders and approve each copy of their trades from your phone. Expo SDK 57 / React Native, TypeScript, Expo Router.

- **Discover**: traders ranked by deposit-adjusted returns, drawdown, consistency and how easy they are to follow by hand (scored by `hl-service`).
- **Inbox**: when someone you follow opens, adds to, cuts, closes or flips a position, you get a push with a copy sized to your account.
- **Review & approve**: edit the size, see your stop-loss/take-profit prices, choose slippage, approve with Face ID. The phone signs the order with its agent key and sends it straight to Hyperliquid, with the stop-loss/take-profit attached as native trigger orders.

## Security model

- On first connect the app generates an **agent key** and stores it in the iOS Keychain / Android Keystore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`: no iCloud sync, no restore to another device).
- You approve that key **once** with your wallet on the web approval page (`dex-hl` `/link`). Hyperliquid agent keys can place and cancel orders but **can't withdraw or transfer funds**, and you can revoke them on Hyperliquid at any time.
- The server never receives a key. It authenticates the phone by a challenge signature from the agent key, checked against Hyperliquid.
- Every order needs your approval (and Face ID, unless you turn that off).

Signing uses [`@nktkas/hyperliquid`](https://github.com/nktkas/hyperliquid). Its signatures were checked byte-for-byte against Hyperliquid's official Python SDK for orders with stop-loss/take-profit, leverage changes and agent approval.

## Run

Requires Node 22 (React Native 0.86 needs ≥ 22.13): `nvm use`.

```bash
npm install
cp .env.example .env     # API + web URLs; localhost works in the iOS simulator
npx expo start --ios     # opens in Expo Go
npm run typecheck && npx expo lint && npm run test:unit
```

The backend (`hl-service`) and web app (`dex-hl`, for the approval page) must be running. On a real phone, set `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_WEB_URL` to your Mac's LAN IP or the deployed URLs.

**Local native builds (`npx expo run:ios`) need Xcode 26.5+.** SDK 57's `expo-modules-jsi` doesn't compile on Xcode 26.3 ([expo/expo#50067](https://github.com/expo/expo/issues/50067), [#50470](https://github.com/expo/expo/issues/50470)). Expo Go and EAS cloud builds aren't affected.

## TestFlight

These steps need your Expo and Apple accounts:

```bash
npx eas-cli@latest login
npx eas-cli@latest init                     # creates the EAS project; also enables push tokens
npx eas-cli@latest build -p ios --profile production
npx eas-cli@latest submit -p ios            # uploads to App Store Connect -> TestFlight
```

Before the first upload, choose the final app name and `ios.bundleIdentifier` in `app.json` (currently `com.tomaszstefaniak.hlcopy`); the bundle id can't be changed once the App Store Connect record exists. Replace the placeholder icon and splash in `assets/`.
