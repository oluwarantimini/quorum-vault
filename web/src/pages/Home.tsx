import { useEffect, useState } from "react";
import { DEMO_VAULT, vault } from "../vault";
import { addr, XLM_SAC } from "../lib/stellar";
import { fromUnits, short } from "../lib/format";
import { Link, useTitle } from "../lib/router";

export function Home() {
  const [failed, setFailed] = useState(false);
  useTitle("Quorum Vault · M-of-N treasuries on Stellar");
  const [policy, setPolicy] = useState<{ signers: string[]; threshold: number; balance: bigint } | null>(null);
  useEffect(() => {
    const c = vault(DEMO_VAULT);
    Promise.all([c.read<string[]>("signers"), c.read<number>("threshold"), c.read<bigint>("balance", [addr(XLM_SAC)])])
      .then(([signers, threshold, balance]) => setPolicy({ signers, threshold, balance }))
      .catch(() => setFailed(true));
  }, []);
  const STATS: [string, string][] = [
    ["Demo policy", policy ? `${policy.threshold} of ${policy.signers.length}` : "…"],
    ["Demo holdings", policy ? `${fromUnits(policy.balance)} XLM` : "…"],
    ["Max signers", "20"],
  ];
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 md:grid-cols-[1.2fr_1fr] md:pt-20">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-volt">M-of-N multisig on Stellar</p>
          <h1 className="mt-4 text-5xl leading-[1.03] md:text-6xl font-bold tracking-tight text-snow">Treasury moves need <span className="text-volt">more than one key</span>.</h1>
          <p className="mt-6 max-w-xl text-lg text-mist">Quorum Vault holds a team’s funds behind a policy like 2-of-3. Any signer proposes a transfer or a membership change, and it only executes once enough current signers approve.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/app" className="btn btn-volt inline-block">Open the vault →</Link>
            <Link to="/docs" className="btn btn-line inline-block">How it works</Link>
          </div>
          <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6">
            {STATS.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] uppercase tracking-wider text-mist">{label}</dt>
                <dd className="mt-1 text-2xl font-bold tracking-tight text-snow">{value}</dd>
              </div>
            ))}
          </dl>
          {failed && (
            <p className="mt-6 text-sm opacity-80" role="status">
              Couldn’t reach Stellar testnet, so live numbers aren’t shown.{" "}
              <button className="font-semibold underline" onClick={() => window.location.reload()}>
                Retry
              </button>
            </p>
          )}
        </div>
        <div className="panel p-7">
          <p className="label">Live demo vault</p>
          <p className="mt-3 text-5xl font-bold">
            {policy ? policy.threshold : "–"}
            <span className="text-mist"> of {policy ? policy.signers.length : "–"}</span>
          </p>
          <p className="mt-1 text-sm text-mist">approvals needed to move funds or change members</p>
          <div className="mt-6 space-y-2">
            {(policy?.signers ?? []).map((s, i) => (
              <div key={s} className="flex items-center justify-between rounded-lg bg-deep px-3 py-2.5">
                <span className="font-mono text-xs">{short(s, 6)}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-mist">signer {i + 1}</span>
              </div>
            ))}
          </div>
          <Link to="/app" className="mt-6 inline-block text-sm font-semibold text-volt underline">
            Open the demo vault →
          </Link>
        </div>
      </section>

      <section className="border-y border-edge bg-deep/50">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-volt">How it works</p>
          <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-snow">Propose, approve, execute</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="panel p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold bg-volt text-white">{i + 1}</span>
                <h3 className="mt-4 text-xl font-bold tracking-tight text-snow">{title}</h3>
                <p className="mt-2 text-sm text-mist">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-volt">Use cases</p>
        <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-snow">For anyone holding funds together</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {USES.map(([icon, title, body]) => (
            <div key={title} className="panel p-6">
              <span className="text-3xl">{icon}</span>
              <h3 className="mt-3 text-lg font-bold tracking-tight text-snow">{title}</h3>
              <p className="mt-2 text-sm text-mist">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-volt">Guarantees</p>
        <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-snow">Built so one key can’t go rogue</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PROMISES.map(([title, body]) => (
            <div key={title} className="rounded-2xl p-7 border border-volt/30 bg-volt/10 text-snow">
              <h3 className="text-xl font-bold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm text-mist">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pt-20">
        <div className="panel flex flex-col items-start justify-between gap-6 p-10 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-snow">Deploy a vault for your team.</h2>
            <p className="mt-2 text-mist">One wallet confirmation deploys the vault with its signers and threshold. No server and no sign-up.</p>
          </div>
          <Link to="/app" className="btn btn-volt inline-block shrink-0">Open the vault →</Link>
        </div>
      </section>
    </>
  );
}

const STEPS: [string, string][] = [
  [
    "Propose",
    "A signer proposes a transfer, a new signer, a removal or a new threshold, with an expiry date. Their own approval counts automatically."
  ],
  [
    "Approve",
    "Other signers review it and approve from their own wallets. They can withdraw an approval until it executes."
  ],
  [
    "Execute",
    "Once approvals from current signers reach the threshold, anyone can execute it and the vault acts in the same transaction."
  ]
];

const USES: [string, string, string][] = [
  [
    "🏢",
    "Startup treasuries",
    "Founders share control of the runway, so no single person can move it alone."
  ],
  [
    "🌐",
    "DAOs & communities",
    "Grant budgets released only when enough stewards agree."
  ],
  [
    "👪",
    "Family funds",
    "Shared savings that need two people to sign off on a withdrawal."
  ],
  [
    "🔐",
    "Cold storage",
    "Keys spread across devices and places, so one lost device isn’t a lost treasury."
  ]
];

const PROMISES: [string, string][] = [
  [
    "Current signers only",
    "Approvals are counted against the signer set at execution, so removing a signer voids their pending approvals."
  ],
  [
    "Proposals expire",
    "Every proposal carries a deadline. A stale approval can’t be executed months later by surprise."
  ],
  [
    "Membership needs a quorum",
    "Adding or removing signers and changing the threshold go through the same approval flow as moving money."
  ]
];
