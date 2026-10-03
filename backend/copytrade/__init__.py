"""Copy-trading core: watch leader wallets, propose sized copies, push them to followers.

The service never holds user keys. Followers approve each proposal on their phone, which
signs the order locally with a Hyperliquid agent key and sends it to Hyperliquid directly.
"""
