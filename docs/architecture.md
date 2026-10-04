# Architecture

## Storage

```text
instance:   Signers: Vec<Address>, Threshold: u32, NextId: u64
persistent: Proposal(id) → { proposer, action, approvals, expires_at, status }
```

`Action` is one of `Transfer(token, to, amount)`, `AddSigner`, `RemoveSigner`
or `SetThreshold`. Governance changes run through exactly the same approval
path as payouts, so there is no privileged admin key.

## Proposal lifecycle

```text
propose ──▶ Pending ──approve/revoke──▶ Pending ──execute (≥ threshold)──▶ Executed
               │                                                    
               ├── cancel (proposer) ──▶ Cancelled
               └── now > expires_at  ──▶ (can no longer be approved or executed)
```

## Counting approvals

`execute` counts only approvals from addresses that are **current**
signers at execution time. Recording approvals by address (not by count)
means that if a signer is removed, their earlier approvals on pending
proposals stop counting. A naive approval counter can't do that.

## Safety checks at execution

- `AddSigner`: the resulting set must have no duplicates and at most 20 members.
- `RemoveSigner`: the threshold must still be reachable afterwards.
- `SetThreshold`: must be between 1 and the number of signers.

A failing check returns an error and Soroban rolls back the whole call, so
a proposal can't half-execute.
