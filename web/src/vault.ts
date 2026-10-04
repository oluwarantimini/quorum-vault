import { xdr } from "@stellar/stellar-sdk";
import { addr, client, i128, u32, type Client } from "./lib/stellar";

export const DEMO_VAULT = import.meta.env.VITE_VAULT_ID ?? "CDI2P43IUZ33F5HNHJO2BNEUT7FDMLVJI3BSI6XS4BXPWO3M4LYLDIVX";
export const VAULT_WASM_HASH =
  import.meta.env.VITE_VAULT_WASM_HASH ?? "a2ccf8d05d213c342926d12888fe6fba6d1b400ff577de7e3d050756bf0991ec";

export const ERRORS: Record<number, string> = {
  1: "This vault is already initialized.",
  2: "This contract isn't an initialized vault.",
  3: "Threshold must be between 1 and the number of signers.",
  4: "Signers must be unique, with between 1 and 20 of them.",
  5: "Only vault signers can do that.",
  6: "No proposal with that id.",
  7: "This proposal is no longer pending.",
  8: "This proposal has expired.",
  9: "You've already approved this proposal.",
  10: "You haven't approved this proposal.",
  11: "Not enough approvals from current signers yet.",
  12: "Transfer amount must be greater than zero.",
  13: "The deadline must be in the future.",
  14: "Only the proposer can cancel it.",
};

export const vault = (id: string): Client => client(id, ERRORS);

export type Action =
  | ["Transfer", string, string, bigint]
  | ["AddSigner", string]
  | ["RemoveSigner", string]
  | ["SetThreshold", number];

export interface Proposal {
  id: bigint;
  proposer: string;
  action: Action;
  approvals: string[];
  expires_at: bigint;
  status: number; // 0 pending, 1 executed, 2 cancelled
}

export function actionScVal(a: Action): xdr.ScVal {
  const tag = xdr.ScVal.scvSymbol(a[0]);
  switch (a[0]) {
    case "Transfer":
      return xdr.ScVal.scvVec([tag, addr(a[1]), addr(a[2]), i128(a[3])]);
    case "AddSigner":
    case "RemoveSigner":
      return xdr.ScVal.scvVec([tag, addr(a[1])]);
    case "SetThreshold":
      return xdr.ScVal.scvVec([tag, u32(a[1])]);
  }
}

/** Proposal ids are sequential; read until the first missing one (capped). */
export async function loadProposals(c: Client, max = 60): Promise<Proposal[]> {
  const out: Proposal[] = [];
  for (let id = 1; id <= max; id++) {
    try {
      out.push(await c.read<Proposal>("get_proposal", [xdr.ScVal.scvU64(new xdr.Uint64(BigInt(id)))]));
    } catch {
      break;
    }
  }
  return out.reverse();
}
