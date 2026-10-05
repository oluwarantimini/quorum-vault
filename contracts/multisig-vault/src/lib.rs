#![no_std]

//! Multisig Vault: an M-of-N treasury for teams, DAOs and grant programs.
//!
//! The vault holds tokens (anyone can deposit by transferring to the
//! contract address). Nothing leaves it, and its membership never changes,
//! unless a proposal collects approvals from at least `threshold` of the
//! current signers before its deadline.
//!
//! Proposals can move funds or change governance itself (add/remove a
//! signer, change the threshold), so the team can rotate keys without
//! redeploying. Approvals are counted against the *current* signer set at
//! execution time: if a signer is removed, their earlier approvals stop
//! counting, which closes the classic "removed member still approves"
//! hole.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env, Vec,
};

pub const MAX_SIGNERS: u32 = 20;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Action {
    /// Send `amount` of `token` from the vault to `to`.
    Transfer(Address, Address, i128),
    AddSigner(Address),
    RemoveSigner(Address),
    SetThreshold(u32),
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProposalStatus {
    Pending = 0,
    Executed = 1,
    Cancelled = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub id: u64,
    pub proposer: Address,
    pub action: Action,
    pub approvals: Vec<Address>,
    /// Ledger timestamp after which the proposal can no longer execute.
    pub expires_at: u64,
    pub status: ProposalStatus,
}

#[contracttype]
pub enum DataKey {
    Signers,
    Threshold,
    NextId,
    Proposal(u64),
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Kept for stable error codes; the vault is now set up by its constructor.
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidThreshold = 3,
    InvalidSigners = 4,
    NotSigner = 5,
    ProposalNotFound = 6,
    NotPending = 7,
    Expired = 8,
    AlreadyApproved = 9,
    NotApproved = 10,
    ThresholdNotMet = 11,
    InvalidAmount = 12,
    InvalidExpiry = 13,
    NotProposer = 14,
}

#[contractevent(topics = ["vault", "proposed"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposed {
    pub proposal_id: u64,
}

#[contractevent(topics = ["vault", "approved"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Approved {
    #[topic]
    pub proposal_id: u64,
    pub signer: Address,
}

#[contractevent(topics = ["vault", "revoked"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApprovalRevoked {
    #[topic]
    pub proposal_id: u64,
    pub signer: Address,
}

#[contractevent(topics = ["vault", "executed"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Executed {
    pub proposal_id: u64,
}

#[contractevent(topics = ["vault", "cancelled"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Cancelled {
    pub proposal_id: u64,
}

const DAY_IN_LEDGERS: u32 = 17_280;
const BUMP_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS;
const BUMP_TO: u32 = 120 * DAY_IN_LEDGERS;

#[contract]
pub struct MultisigVault;

#[contractimpl]
impl MultisigVault {
    /// Set the initial signers and approval threshold at deployment.
    ///
    /// This is a constructor so deployment and setup are one atomic step:
    /// there is never an uninitialised vault that someone else could claim.
    pub fn __constructor(env: Env, signers: Vec<Address>, threshold: u32) -> Result<(), Error> {
        validate_config(&signers, threshold)?;
        env.storage().instance().set(&DataKey::Signers, &signers);
        env.storage()
            .instance()
            .set(&DataKey::Threshold, &threshold);
        bump_instance(&env);
        Ok(())
    }

    /// Create a proposal. The proposer must be a signer and their approval
    /// is recorded immediately.
    pub fn propose(
        env: Env,
        proposer: Address,
        action: Action,
        expires_at: u64,
    ) -> Result<u64, Error> {
        proposer.require_auth();
        require_signer(&env, &proposer)?;
        if expires_at <= env.ledger().timestamp() {
            return Err(Error::InvalidExpiry);
        }
        match &action {
            Action::Transfer(_, _, amount) if *amount <= 0 => return Err(Error::InvalidAmount),
            // Catch removals that could never execute (e.g. 3-of-3 -> 2
            // signers) now, instead of after a full approval round.
            Action::RemoveSigner(old) => {
                let current = signers(&env)?;
                if !current.contains(old) {
                    return Err(Error::NotSigner);
                }
                if threshold(&env)? > current.len() - 1 {
                    return Err(Error::InvalidThreshold);
                }
            }
            _ => {}
        }

        let id = next_id(&env);
        let mut approvals = Vec::new(&env);
        approvals.push_back(proposer.clone());
        let proposal = Proposal {
            id,
            proposer,
            action,
            approvals,
            expires_at,
            status: ProposalStatus::Pending,
        };
        save(&env, &proposal);
        Proposed { proposal_id: id }.publish(&env);
        Ok(id)
    }

    pub fn approve(env: Env, signer: Address, proposal_id: u64) -> Result<(), Error> {
        signer.require_auth();
        require_signer(&env, &signer)?;
        let mut proposal = load_live(&env, proposal_id)?;
        if proposal.approvals.contains(&signer) {
            return Err(Error::AlreadyApproved);
        }
        proposal.approvals.push_back(signer.clone());
        save(&env, &proposal);
        Approved {
            proposal_id,
            signer,
        }
        .publish(&env);
        Ok(())
    }

    /// Withdraw an earlier approval before the proposal executes.
    pub fn revoke_approval(env: Env, signer: Address, proposal_id: u64) -> Result<(), Error> {
        signer.require_auth();
        let mut proposal = load_live(&env, proposal_id)?;
        let index = proposal
            .approvals
            .first_index_of(&signer)
            .ok_or(Error::NotApproved)?;
        proposal.approvals.remove(index);
        save(&env, &proposal);
        ApprovalRevoked {
            proposal_id,
            signer,
        }
        .publish(&env);
        Ok(())
    }

    /// Execute once enough *current* signers have approved. Anyone can call
    /// it; the approvals are the authorization.
    pub fn execute(env: Env, proposal_id: u64) -> Result<(), Error> {
        let mut proposal = load_live(&env, proposal_id)?;
        let signers = signers(&env)?;
        let valid = proposal
            .approvals
            .iter()
            .filter(|a| signers.contains(a))
            .count() as u32;
        if valid < threshold(&env)? {
            return Err(Error::ThresholdNotMet);
        }

        match proposal.action.clone() {
            Action::Transfer(token, to, amount) => {
                token::Client::new(&env, &token).transfer(
                    &env.current_contract_address(),
                    &to,
                    &amount,
                );
            }
            Action::AddSigner(new_signer) => {
                let mut updated = signers.clone();
                updated.push_back(new_signer);
                validate_signers(&updated)?;
                env.storage().instance().set(&DataKey::Signers, &updated);
            }
            Action::RemoveSigner(old) => {
                let mut updated = signers.clone();
                let index = updated.first_index_of(&old).ok_or(Error::NotSigner)?;
                updated.remove(index);
                validate_signers(&updated)?;
                if threshold(&env)? > updated.len() {
                    return Err(Error::InvalidThreshold);
                }
                env.storage().instance().set(&DataKey::Signers, &updated);
            }
            Action::SetThreshold(new_threshold) => {
                if new_threshold == 0 || new_threshold > signers.len() {
                    return Err(Error::InvalidThreshold);
                }
                env.storage()
                    .instance()
                    .set(&DataKey::Threshold, &new_threshold);
            }
        }

        proposal.status = ProposalStatus::Executed;
        save(&env, &proposal);
        bump_instance(&env);
        Executed { proposal_id }.publish(&env);
        Ok(())
    }

    /// The proposer can withdraw a proposal that hasn't executed.
    pub fn cancel(env: Env, proposer: Address, proposal_id: u64) -> Result<(), Error> {
        proposer.require_auth();
        let mut proposal = get(&env, proposal_id)?;
        if proposal.status != ProposalStatus::Pending {
            return Err(Error::NotPending);
        }
        if proposal.proposer != proposer {
            return Err(Error::NotProposer);
        }
        proposal.status = ProposalStatus::Cancelled;
        save(&env, &proposal);
        Cancelled { proposal_id }.publish(&env);
        Ok(())
    }

    pub fn get_proposal(env: Env, proposal_id: u64) -> Result<Proposal, Error> {
        get(&env, proposal_id)
    }

    pub fn signers(env: Env) -> Result<Vec<Address>, Error> {
        signers(&env)
    }

    pub fn threshold(env: Env) -> Result<u32, Error> {
        threshold(&env)
    }

    /// Number of proposals ever created; ids run from 1 to this value.
    pub fn proposal_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
    }

    pub fn balance(env: Env, token: Address) -> i128 {
        token::Client::new(&env, &token).balance(&env.current_contract_address())
    }
}

fn validate_config(signers: &Vec<Address>, threshold: u32) -> Result<(), Error> {
    validate_signers(signers)?;
    if threshold == 0 || threshold > signers.len() {
        return Err(Error::InvalidThreshold);
    }
    Ok(())
}

fn validate_signers(signers: &Vec<Address>) -> Result<(), Error> {
    if signers.is_empty() || signers.len() > MAX_SIGNERS {
        return Err(Error::InvalidSigners);
    }
    for (i, s) in signers.iter().enumerate() {
        if signers.iter().skip(i + 1).any(|other| other == s) {
            return Err(Error::InvalidSigners);
        }
    }
    Ok(())
}

fn signers(env: &Env) -> Result<Vec<Address>, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Signers)
        .ok_or(Error::NotInitialized)
}

fn threshold(env: &Env) -> Result<u32, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Threshold)
        .ok_or(Error::NotInitialized)
}

fn require_signer(env: &Env, who: &Address) -> Result<(), Error> {
    if signers(env)?.contains(who) {
        Ok(())
    } else {
        Err(Error::NotSigner)
    }
}

fn get(env: &Env, id: u64) -> Result<Proposal, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Proposal(id))
        .ok_or(Error::ProposalNotFound)
}

/// A proposal that can still be approved or executed.
fn load_live(env: &Env, id: u64) -> Result<Proposal, Error> {
    let proposal = get(env, id)?;
    if proposal.status != ProposalStatus::Pending {
        return Err(Error::NotPending);
    }
    if env.ledger().timestamp() > proposal.expires_at {
        return Err(Error::Expired);
    }
    Ok(proposal)
}

fn save(env: &Env, proposal: &Proposal) {
    let key = DataKey::Proposal(proposal.id);
    env.storage().persistent().set(&key, proposal);
    env.storage()
        .persistent()
        .extend_ttl(&key, BUMP_THRESHOLD, BUMP_TO);
}

fn next_id(env: &Env) -> u64 {
    let next: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextId)
        .unwrap_or(0u64)
        + 1;
    env.storage().instance().set(&DataKey::NextId, &next);
    bump_instance(env);
    next
}

fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_TO);
}

mod test;
