# TODO (submission due 2026-10-12 23:59 PT)

## Waiting on Tomasz
- [ ] **App icon + splash** (`mobile/assets/`): 1024×1024 PNG, no transparency for iOS
- [ ] **Domain** pointing to the VPS (A record), plus VPS address / SSH user / OS → deploy (`deploy/README.md`)
- [ ] `npx eas-cli@latest login` + `init` (enables push tokens), then first TestFlight build
- [ ] First testnet end-to-end run: connect → approve phone → follow → approve a copy
- [x] License: MIT
- [x] Public GitHub repo `tomaszstefaniak/spiderperps`
- [ ] Builder fee: rate (e.g. 0.05%) and the address that receives it
- [ ] Fix git email: `git config --global user.email stefaniak.tom@gmail.com`
- [ ] Optional: Xcode 26.5+ for local native builds (Expo SDK 57 doesn't compile on 26.3)

## Engineering
- [ ] First `docker compose up --build` happens on the VPS. Not verified locally: Docker Desktop on the Mac couldn't reach Docker Hub. Verified instead: `docker compose config`, and the web standalone server serving every route.
- [ ] Set `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_WEB_URL` in `mobile/eas.json` once the domain exists
- [x] Web order ticket: sign in the browser with an agent key + real TP/SL; delete the server-key endpoints
- [ ] Tomasz: test the web ticket with MetaMask on testnet (Connect → Enable trading → order with TP/SL)
- [x] Public web pages for judges: landing + trader rankings + trader profile
- [ ] Builder fee: approveBuilderFee on the approval page + `builder` on copy orders
- [ ] HIP-3 markets (`xyz:AVGO`-style) in the watcher and order execution
- [ ] Desktop-wallet pairing with a short code (QR on the phone only helps a second phone)

## Submission
- [ ] Pitch video (2–3 min) and product demo video (≤ 3 min, real phone, testnet)
- [ ] Colosseum form, including the prior-work disclosure (see README)
- [ ] Apple: an organization developer account before any public App Store release
