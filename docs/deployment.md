# Testnet deployment

The web app and the examples in the README use this deployment on **Stellar testnet**
(Test SDF Network ; September 2015). Testnet is reset periodically; redeploy with the
commands in the README and update `web/.env.example` if these stop resolving.

| | |
| --- | --- |
| Demo vault (2-of-3) | [`CDI2P43IUZ33F5HNHJO2BNEUT7FDMLVJI3BSI6XS4BXPWO3M4LYLDIVX`](https://stellar.expert/explorer/testnet/contract/CDI2P43IUZ33F5HNHJO2BNEUT7FDMLVJI3BSI6XS4BXPWO3M4LYLDIVX) |
| Vault wasm hash (used by "Deploy your own vault") | `105493fa37b90c9ae76b83c305d2e8151f2a3abd942330ae223c801113cfc1e9` (constructor build, 2026-10-05) |

Deployed 2026-10-04. Native XLM's asset contract on testnet is
`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`.

The demo vault was deployed from the earlier build (separate `init` call). New vaults
created from the web app use the constructor build above.
