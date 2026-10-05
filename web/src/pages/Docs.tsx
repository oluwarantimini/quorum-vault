import { DEMO_VAULT } from "../vault";
import { contractLink } from "../lib/stellar";
import { useEffect } from "react";
import { Link, useSection, useTitle } from "../lib/router";

const SECTIONS = [
  ["start", "Getting started"],
  ["concepts", "Concepts"],
  ["reference", "Contract reference"],
  ["faq", "FAQ"],
] as const;

export function Docs() {
  useTitle("Docs · Quorum Vault");
  const section = useSection();
  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView({ behavior: "smooth" });
  }, [section]);
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-5 py-14 lg:grid-cols-[210px_1fr]">
      <aside className="hidden lg:block">
        <nav className="sticky top-24 space-y-1 text-sm">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-[0.2em] text-volt">On this page</p>
          {SECTIONS.map(([id, label]) => (
            <Link key={id} to={`/docs/${id}`} className="block rounded-lg px-3 py-2 text-mist hover:bg-panel hover:text-snow">
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <article className="min-w-0 space-y-16">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-volt">Documentation</p>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight text-snow">How Quorum Vault works</h1>
          <p className="mt-4 max-w-2xl text-lg text-mist">A Soroban contract that holds any Stellar asset and only moves it when enough signers agree.</p>
        </header>

        <section id="start" className="scroll-mt-24 space-y-5">
          <h2 className="text-3xl font-bold tracking-tight text-snow">Getting started</h2>
          <ol className="space-y-3">
            {START.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold bg-volt text-white">{i + 1}</span>
                <p className="pt-0.5 text-snow/90">{step}</p>
              </li>
            ))}
          </ol>
          <Link to="/app" className="btn btn-volt inline-block inline-block">Open the vault →</Link>
        </section>

        <section id="concepts" className="scroll-mt-24 space-y-5">
          <h2 className="text-3xl font-bold tracking-tight text-snow">Concepts</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {CONCEPTS.map(([term, body]) => (
              <div key={term} className="panel p-5">
                <h3 className="text-lg font-bold tracking-tight text-snow">{term}</h3>
                <p className="mt-1.5 text-sm text-mist">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="reference" className="scroll-mt-24 space-y-5">
          <h2 className="text-3xl font-bold tracking-tight text-snow">Contract reference</h2>
          <p className="text-mist">
            Deployed on testnet at{" "}
            <a className="break-all font-mono text-sm underline text-volt" href={contractLink(DEMO_VAULT)} target="_blank" rel="noreferrer">{DEMO_VAULT}</a>
          </p>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-edge text-xs uppercase tracking-wider text-mist">
                <tr>
                  <th className="p-3.5">Function</th>
                  <th className="p-3.5">Signed by</th>
                  <th className="p-3.5">What it does</th>
                </tr>
              </thead>
              <tbody>
                {REFERENCE.map(([fn, who, what]) => (
                  <tr key={fn} className="border-t border-edge">
                    <td className="p-3.5 font-mono text-xs text-snow">{fn}</td>
                    <td className="p-3.5 text-mist">{who}</td>
                    <td className="p-3.5 text-mist">{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 space-y-3">
          <h2 className="text-3xl font-bold tracking-tight text-snow">FAQ</h2>
          {FAQ.map(([q, a]) => (
            <details key={q} className="panel group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-snow">
                {q}
                <span className="transition group-open:rotate-45 text-volt">+</span>
              </summary>
              <p className="mt-3 text-sm text-mist">{a}</p>
            </details>
          ))}
        </section>
      </article>
    </div>
  );
}

const START: string[] = [
  "Install the Freighter browser wallet, switch it to Testnet and fund the account with test XLM from Friendbot (lab.stellar.org/account/fund).",
  "Open the app and choose “Deploy your own vault”. List the other signers’ G… addresses and pick a threshold.",
  "Fund the vault by sending XLM or any asset to its contract address.",
  "Propose a transfer, ask co-signers to approve it, and execute once the threshold is met."
];

const CONCEPTS: [string, string][] = [
  [
    "Signers",
    "Up to 20 unique addresses who can propose and approve. Set at deployment, changed only by proposal."
  ],
  [
    "Threshold",
    "How many current signers must approve before a proposal executes: the M in M-of-N."
  ],
  [
    "Proposal",
    "One action (Transfer, AddSigner, RemoveSigner or SetThreshold) with an expiry time and a list of approvals."
  ],
  [
    "Execution",
    "Anyone can trigger it once there are enough approvals; the contract re-checks them against the current signers."
  ]
];

const REFERENCE: [string, string, string][] = [
  [
    "constructor(signers, threshold)",
    "deployer",
    "Sets signers and threshold at deployment, in the same transaction"
  ],
  [
    "propose(proposer, action, expires_at)",
    "signer",
    "Creates a proposal, approved by the proposer"
  ],
  [
    "approve(signer, proposal_id)",
    "signer",
    "Adds an approval"
  ],
  [
    "revoke_approval(signer, proposal_id)",
    "signer",
    "Withdraws an approval before execution"
  ],
  [
    "execute(proposal_id)",
    "anyone",
    "Runs the action once enough current signers approved"
  ],
  [
    "cancel(proposer, proposal_id)",
    "proposer",
    "Cancels a pending proposal"
  ],
  [
    "get_proposal · signers · threshold · balance(token)",
    "—",
    "Read state"
  ],
  [
    "proposal_count()",
    "—",
    "Number of proposals; ids run from 1 to this value"
  ]
];

const FAQ: [string, string][] = [
  [
    "What if a signer loses their key?",
    "The others propose RemoveSigner, and AddSigner for a replacement. As long as the threshold can still be reached, the vault recovers."
  ],
  [
    "Can a removed signer still approve old proposals?",
    "Their approvals stay recorded but are ignored: only approvals from current signers count at execution."
  ],
  [
    "Which assets can the vault hold?",
    "Native XLM and any Stellar asset with a Stellar Asset Contract. A transfer names the asset’s contract id."
  ],
  [
    "What does it cost?",
    "Only Stellar network fees. There’s no protocol fee and nobody in the middle."
  ],
  [
    "Can I set 1-of-1?",
    "Yes, but then it’s a single-key wallet with extra steps. 2-of-3 is a common starting point."
  ],
  [
    "Is it audited?",
    "Not yet. It runs on Stellar testnet and is open source; treat it as a working prototype until it has been audited."
  ]
];
