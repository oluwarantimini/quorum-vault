import { useCallback, useEffect, useMemo, useState } from "react";
import { StrKey } from "@stellar/stellar-sdk";
import { actionScVal, DEMO_VAULT, loadProposals, vault, VAULT_WASM_HASH, type Action, type Proposal } from "./vault";
import { addr, contractLink, deployContract, txLink, u32, u64, XLM_SAC } from "./lib/stellar";
import { fromUnits, short, timeLeft, toUnits } from "./lib/format";
import { useWallet } from "./lib/useWallet";
import { routeParams } from "./lib/router";
import { useAction } from "./lib/useAction";
import { xdr } from "@stellar/stellar-sdk";

export type Wallet = ReturnType<typeof useWallet>;

export function Workspace({ wallet }: { wallet: Wallet }) {
  const [vaultId, setVaultId] = useState(
    () => routeParams().get("vault") ?? new URLSearchParams(window.location.search).get("vault") ?? DEMO_VAULT,
  );
  const [showDeploy, setShowDeploy] = useState(false);

  const open = (id: string) => {
    setVaultId(id);
    // Keep the vault in the hash route so the link can be shared and reloaded.
    history.replaceState(null, "", `${window.location.pathname}#/app?vault=${id}`);
  };

  return (
    <div>
      <header className="border-b border-edge/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <button className="btn btn-line" onClick={() => setShowDeploy((v) => !v)}>
              {showDeploy ? "Close" : "Deploy your own vault"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-5 py-8">
        {showDeploy && <DeployVault wallet={wallet} onDeployed={(id) => (open(id), setShowDeploy(false))} />}
        <VaultPicker current={vaultId} onOpen={open} />
        <VaultView key={vaultId} vaultId={vaultId} wallet={wallet} />
      </main>

    </div>
  );
}

function Notice({ a }: { a: ReturnType<typeof useAction> }) {
  if (a.error) return <p className="rounded-lg bg-fail/10 px-3 py-2 text-sm text-fail">{a.error}</p>;
  if (a.notice)
    return (
      <p className="rounded-lg bg-pass/10 px-3 py-2 text-sm text-pass">
        {a.notice.text}{" "}
        {a.notice.hash && (
          <a className="underline" href={txLink(a.notice.hash)} target="_blank" rel="noreferrer">
            tx ↗
          </a>
        )}
      </p>
    );
  return null;
}

function VaultPicker({ current, onOpen }: { current: string; onOpen: (id: string) => void }) {
  const [id, setId] = useState(current);
  return (
    <form
      className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        if (StrKey.isValidContract(id.trim())) onOpen(id.trim());
      }}
    >
      <span className="label shrink-0">Vault</span>
      <input className="field font-mono text-xs" value={id} onChange={(e) => setId(e.target.value)} />
      <button className="btn btn-line shrink-0">Open</button>
      {current === DEMO_VAULT && <span className="shrink-0 text-xs text-warn">Demo vault: read-only unless you're a signer</span>}
    </form>
  );
}

function useVault(vaultId: string) {
  const c = useMemo(() => vault(vaultId), [vaultId]);
  const [signers, setSigners] = useState<string[]>([]);
  const [threshold, setThreshold] = useState(0);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [s, t, b] = await Promise.all([
        c.read<string[]>("signers"),
        c.read<number>("threshold"),
        c.read<bigint>("balance", [addr(XLM_SAC)]),
      ]);
      setSigners(s);
      setThreshold(t);
      setBalance(b);
      setProposals(await loadProposals(c));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [c]);

  useEffect(() => {
    refresh();
  }, [refresh]);
  return { c, signers, threshold, proposals, balance, error, refresh };
}

function VaultView({ vaultId, wallet }: { vaultId: string; wallet: Wallet }) {
  const v = useVault(vaultId);
  const isSigner = !!wallet.address && v.signers.includes(wallet.address);

  if (v.error) return <p className="panel p-6 text-fail">{v.error}</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <aside className="space-y-6">
        <section className="panel p-5">
          <p className="label">Policy</p>
          <p className="mt-2 text-4xl font-bold">
            {v.threshold}
            <span className="text-mist"> of {v.signers.length}</span>
          </p>
          <p className="mt-1 text-sm text-mist">approvals required to move funds or change members</p>
          <div className="mt-5 space-y-2">
            {v.signers.map((s) => (
              <div key={s} className="flex items-center justify-between rounded-lg bg-deep px-3 py-2">
                <span className="font-mono text-xs">{short(s, 6)}</span>
                {s === wallet.address && <span className="text-[10px] font-bold uppercase text-pass">you</span>}
              </div>
            ))}
          </div>
        </section>
        <section className="panel p-5">
          <p className="label">Holdings</p>
          <p className="mt-2 text-3xl font-semibold">
            {v.balance === null ? "…" : fromUnits(v.balance)} <span className="text-base text-mist">XLM</span>
          </p>
          <p className="mt-2 text-xs text-mist">
            Fund it by sending any asset to{" "}
            <a className="font-mono underline" href={contractLink(vaultId)} target="_blank" rel="noreferrer">
              {short(vaultId, 6)}
            </a>
          </p>
        </section>
      </aside>

      <section className="space-y-6">
        {isSigner ? (
          <Composer client={v.c} wallet={wallet} onDone={v.refresh} />
        ) : (
          <div className="panel p-5 text-sm text-mist">
            {wallet.address
              ? "Your wallet isn't a signer on this vault, so you can watch but not propose or approve."
              : "Connect a signer's wallet to propose, approve and execute."}
          </div>
        )}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Proposals</h2>
            <button className="text-xs text-mist underline" onClick={v.refresh}>
              Refresh
            </button>
          </div>
          {v.proposals === null ? (
            <p className="text-sm text-mist">Loading…</p>
          ) : v.proposals.length === 0 ? (
            <p className="panel p-6 text-sm text-mist">No proposals yet.</p>
          ) : (
            <div className="space-y-3">
              {v.proposals.map((p) => (
                <ProposalCard key={String(p.id)} p={p} v={v} wallet={wallet} isSigner={isSigner} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function describe(a: Action) {
  switch (a[0]) {
    case "Transfer":
      return `Send ${fromUnits(a[3])} ${a[1] === XLM_SAC ? "XLM" : short(a[1])} to ${short(a[2], 5)}`;
    case "AddSigner":
      return `Add signer ${short(a[1], 5)}`;
    case "RemoveSigner":
      return `Remove signer ${short(a[1], 5)}`;
    case "SetThreshold":
      return `Change threshold to ${a[1]}`;
  }
}

function ProposalCard({
  p,
  v,
  wallet,
  isSigner,
}: {
  p: Proposal;
  v: ReturnType<typeof useVault>;
  wallet: Wallet;
  isSigner: boolean;
}) {
  const act = useAction();
  const valid = p.approvals.filter((a) => v.signers.includes(a)).length;
  const expired = Number(p.expires_at) * 1000 < Date.now();
  const pending = p.status === 0 && !expired;
  const mine = wallet.address ? p.approvals.includes(wallet.address) : false;
  const pct = Math.min(100, (valid / Math.max(1, v.threshold)) * 100);
  const status = p.status === 1 ? ["Executed", "text-pass"] : p.status === 2 ? ["Cancelled", "text-mist"] : expired ? ["Expired", "text-fail"] : ["Pending", "text-warn"];
  const call = (label: string, method: string, args: xdr.ScVal[], text: string) =>
    act.run(label, async () => {
      const r = await v.c.invoke(wallet.address!, method, args);
      await v.refresh();
      return r;
    }, (r) => ({ text, hash: r.hash }));

  return (
    <article className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-mist">#{String(p.id)} · by {short(p.proposer, 5)}</p>
          <h3 className="mt-1 text-base font-semibold">{describe(p.action)}</h3>
        </div>
        <span className={`text-xs font-bold uppercase tracking-wider ${status[1]}`}>{status[0]}</span>
      </div>
      <div className="mt-4">
        <div className="flex justify-between text-xs text-mist">
          <span>
            {valid} / {v.threshold} approvals
          </span>
          <span>{p.status === 0 ? `expires ${timeLeft(p.expires_at)}` : ""}</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-deep">
          <div className={`h-full rounded-full ${valid >= v.threshold ? "bg-pass" : "bg-volt"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      {isSigner && pending && (
        <div className="mt-4 flex flex-wrap gap-2">
          {!mine ? (
            <button className="btn btn-volt" disabled={!!act.busy} onClick={() => call("approve", "approve", [addr(wallet.address!), u64(p.id)], "Approved.")}>
              Approve
            </button>
          ) : (
            <button className="btn btn-line" disabled={!!act.busy} onClick={() => call("revoke", "revoke_approval", [addr(wallet.address!), u64(p.id)], "Approval withdrawn.")}>
              Withdraw approval
            </button>
          )}
          {valid >= v.threshold && (
            <button className="btn btn-pass" disabled={!!act.busy} onClick={() => call("exec", "execute", [u64(p.id)], "Executed.")}>
              Execute
            </button>
          )}
          {p.proposer === wallet.address && (
            <button className="btn btn-fail" disabled={!!act.busy} onClick={() => call("cancel", "cancel", [addr(wallet.address!), u64(p.id)], "Cancelled.")}>
              Cancel
            </button>
          )}
        </div>
      )}
      <div className="mt-3">
        <Notice a={act} />
      </div>
    </article>
  );
}

function Composer({ client, wallet, onDone }: { client: ReturnType<typeof vault>; wallet: Wallet; onDone: () => void }) {
  const [kind, setKind] = useState<Action[0]>("Transfer");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState(XLM_SAC);
  const [who, setWho] = useState("");
  const [threshold, setThreshold] = useState("2");
  const [days, setDays] = useState("7");
  const act = useAction();
  const [held, setHeld] = useState<bigint | null>(null);
  useEffect(() => {
    setHeld(null);
    if (!StrKey.isValidContract(token)) return;
    client.read<bigint>("balance", [addr(token)]).then(setHeld).catch(() => setHeld(null));
  }, [client, token]);
  let overdraw = false;
  try {
    overdraw = kind === "Transfer" && held !== null && amount !== "" && toUnits(amount) > held;
  } catch {
    overdraw = false;
  }
  function build(): Action {
    const valid = (a: string) => StrKey.isValidEd25519PublicKey(a) || StrKey.isValidContract(a);
    if (kind === "Transfer") {
      if (!valid(to)) throw new Error("Enter a valid recipient address.");
      return ["Transfer", token, to, toUnits(amount)];
    }
    if (kind === "SetThreshold") return ["SetThreshold", Number(threshold)];
    if (!valid(who)) throw new Error("Enter a valid signer address.");
    return [kind, who];
  }

  return (
    <form
      className="panel p-5"
      onSubmit={(e) => {
        e.preventDefault();
        act.run(
          "propose",
          async () => {
            const action = build();
            const expires = BigInt(Math.floor(Date.now() / 1000) + Number(days) * 86_400);
            const r = await client.invoke<bigint>(wallet.address!, "propose", [addr(wallet.address!), actionScVal(action), u64(expires)]);
            onDone();
            return r;
          },
          (r) => ({ text: `Proposal #${r.result} created with your approval.`, hash: r.hash }),
        );
      }}
    >
      <h2 className="text-lg font-semibold">New proposal</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {(["Transfer", "AddSigner", "RemoveSigner", "SetThreshold"] as const).map((k) => (
          <button type="button" key={k} onClick={() => setKind(k)} className={`btn ${kind === k ? "btn-volt" : "btn-line"}`}>
            {k.replace(/([A-Z])/g, " $1").trim()}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {kind === "Transfer" && (
          <>
            <input className="field font-mono text-xs sm:col-span-2" placeholder="Recipient G… / C…" value={to} onChange={(e) => setTo(e.target.value.trim())} />
            <input className="field" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <input className="field font-mono text-xs" title="Asset contract (XLM by default)" value={token} onChange={(e) => setToken(e.target.value.trim())} />
            {overdraw && (
              <p className="text-xs text-warn sm:col-span-2">
                The vault holds {fromUnits(held!)} of this asset. You can still propose it, but it will only execute once the vault is funded.
              </p>
            )}
          </>
        )}
        {(kind === "AddSigner" || kind === "RemoveSigner") && (
          <input className="field font-mono text-xs sm:col-span-2" placeholder="Signer address G…" value={who} onChange={(e) => setWho(e.target.value.trim())} />
        )}
        {kind === "SetThreshold" && <input className="field" type="number" min="1" value={threshold} onChange={(e) => setThreshold(e.target.value)} />}
        <label className="flex items-center gap-2 text-sm text-mist">
          Expires in
          <input className="field w-20" type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} /> days
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button className="btn btn-volt" disabled={!!act.busy}>
          {act.busy ? "Confirm in wallet…" : "Propose"}
        </button>
        <Notice a={act} />
      </div>
    </form>
  );
}

function DeployVault({ wallet, onDeployed }: { wallet: Wallet; onDeployed: (id: string) => void }) {
  const [signers, setSigners] = useState("");
  const [threshold, setThreshold] = useState("2");
  const act = useAction();
  return (
    <form
      className="panel border-volt/50 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const me = wallet.address ?? (await wallet.connect());
        if (!me) return;
        const list = Array.from(new Set([me, ...signers.split(/[\s,]+/).filter(Boolean)]));
        await act.run(
          "deploy",
          async () => {
            for (const s of list) if (!StrKey.isValidEd25519PublicKey(s)) throw new Error(`${short(s)} isn't a valid G… address.`);
            const t = Number(threshold);
            if (!(t >= 1 && t <= list.length)) throw new Error(`Threshold must be between 1 and ${list.length}.`);
            // Signers and threshold go in as constructor arguments: one atomic step.
            const r = await deployContract(me, VAULT_WASM_HASH, [xdr.ScVal.scvVec(list.map(addr)), u32(t)]);
            setTimeout(() => onDeployed(r.contractId), 1500);
            return r;
          },
          (r) => ({ text: `Vault ${short(r.contractId, 6)} deployed and initialized.`, hash: r.hash }),
        );
      }}
    >
      <h2 className="text-lg font-semibold">Deploy your own vault</h2>
      <p className="mt-1 text-sm text-mist">One wallet confirmation deploys the vault with its signers and threshold. You're included automatically.</p>
      <textarea className="field mt-4 h-24 font-mono text-xs" placeholder="Other signers' G… addresses, one per line" value={signers} onChange={(e) => setSigners(e.target.value)} />
      <div className="mt-3 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-mist">
          Threshold <input className="field w-20" type="number" min="1" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </label>
        <button className="btn btn-volt" disabled={!!act.busy}>
          {act.busy ? "Working…" : "Deploy vault"}
        </button>
      </div>
      <div className="mt-3">
        <Notice a={act} />
      </div>
    </form>
  );
}
