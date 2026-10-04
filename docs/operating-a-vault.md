# Operating a vault

## Choosing a threshold

| Team | Suggested |
| --- | --- |
| 2 founders | 2-of-2 (or 2-of-3 with a recovery key held offline) |
| Small DAO council | 3-of-5 |
| Grant committee | ⌈n/2⌉+1 of n |

Avoid N-of-N for N > 2: one lost key freezes the vault.

## Rotating a lost or compromised key

1. A remaining signer proposes `AddSigner(new_key)` and the others approve and execute.
2. Then propose `RemoveSigner(old_key)`, approve and execute.

Because approvals are re-checked against the current signer set, any
pending proposals the old key approved need fresh approvals.

## Deadlines

Give payouts short deadlines (days, not months). A half-approved transfer
that sits around for a long time is a liability.

## Funding

Send any Stellar asset to the vault's contract address. `balance(token)`
reports the holdings for each asset.
