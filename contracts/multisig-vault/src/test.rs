#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::StellarAssetClient,
    vec, Env,
};

const DAY: u64 = 86_400;

struct Setup<'a> {
    env: Env,
    vault: MultisigVaultClient<'a>,
    signers: [Address; 3],
    token: Address,
    token_client: token::Client<'a>,
}

/// A 2-of-3 vault holding 1,000,000 units of a test token.
fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    let signers = [
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];
    let id = env.register(
        MultisigVault,
        (
            vec![
                &env,
                signers[0].clone(),
                signers[1].clone(),
                signers[2].clone(),
            ],
            2u32,
        ),
    );
    let vault = MultisigVaultClient::new(&env, &id);

    let token = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    StellarAssetClient::new(&env, &token).mint(&id, &1_000_000);
    let token_client = token::Client::new(&env, &token);
    Setup {
        env,
        vault,
        signers,
        token,
        token_client,
    }
}

fn deadline(env: &Env) -> u64 {
    env.ledger().timestamp() + 7 * DAY
}

#[test]
fn constructor_validates_signers_and_threshold() {
    let env = Env::default();
    let a = Address::generate(&env);
    assert_eq!(
        validate_config(&Vec::new(&env), 1),
        Err(Error::InvalidSigners)
    );
    assert_eq!(
        validate_config(&vec![&env, a.clone(), a.clone()], 1),
        Err(Error::InvalidSigners)
    );
    assert_eq!(
        validate_config(&vec![&env, a.clone()], 2),
        Err(Error::InvalidThreshold)
    );
    assert_eq!(
        validate_config(&vec![&env, a.clone()], 0),
        Err(Error::InvalidThreshold)
    );

    assert_eq!(validate_config(&vec![&env, a.clone()], 1), Ok(()));

    // The constructor applies the same checks at deployment.
    let vault = MultisigVaultClient::new(
        &env,
        &env.register(MultisigVault, (vec![&env, a.clone()], 1u32)),
    );
    assert_eq!(vault.signers(), vec![&env, a]);
    assert_eq!(vault.threshold(), 1);
}

#[test]
fn transfer_executes_once_threshold_is_met() {
    let s = setup();
    let recipient = Address::generate(&s.env);
    let id = s.vault.propose(
        &s.signers[0],
        &Action::Transfer(s.token.clone(), recipient.clone(), 250_000),
        &deadline(&s.env),
    );

    // 1 of 2: the proposer's own approval isn't enough.
    assert_eq!(s.vault.try_execute(&id), Err(Ok(Error::ThresholdNotMet)));

    s.vault.approve(&s.signers[1], &id);
    s.vault.execute(&id);

    assert_eq!(s.token_client.balance(&recipient), 250_000);
    assert_eq!(s.vault.balance(&s.token), 750_000);
    assert_eq!(s.vault.get_proposal(&id).status, ProposalStatus::Executed);
}

#[test]
fn a_proposal_cannot_execute_twice() {
    let s = setup();
    let id = s.vault.propose(
        &s.signers[0],
        &Action::Transfer(s.token.clone(), Address::generate(&s.env), 1),
        &deadline(&s.env),
    );
    s.vault.approve(&s.signers[1], &id);
    s.vault.execute(&id);

    assert_eq!(s.vault.try_execute(&id), Err(Ok(Error::NotPending)));
    assert_eq!(
        s.vault.try_approve(&s.signers[2], &id),
        Err(Ok(Error::NotPending))
    );
}

#[test]
fn non_signers_cannot_propose_or_approve() {
    let s = setup();
    let outsider = Address::generate(&s.env);
    let action = Action::Transfer(s.token.clone(), outsider.clone(), 1);

    assert_eq!(
        s.vault.try_propose(&outsider, &action, &deadline(&s.env)),
        Err(Ok(Error::NotSigner))
    );

    let id = s.vault.propose(&s.signers[0], &action, &deadline(&s.env));
    assert_eq!(
        s.vault.try_approve(&outsider, &id),
        Err(Ok(Error::NotSigner))
    );
}

#[test]
fn double_approval_is_rejected() {
    let s = setup();
    let id = s
        .vault
        .propose(&s.signers[0], &Action::SetThreshold(3), &deadline(&s.env));
    assert_eq!(
        s.vault.try_approve(&s.signers[0], &id),
        Err(Ok(Error::AlreadyApproved))
    );
}

#[test]
fn revoked_approvals_no_longer_count() {
    let s = setup();
    let id = s.vault.propose(
        &s.signers[0],
        &Action::Transfer(s.token.clone(), Address::generate(&s.env), 10),
        &deadline(&s.env),
    );
    s.vault.approve(&s.signers[1], &id);
    s.vault.revoke_approval(&s.signers[1], &id);

    assert_eq!(s.vault.try_execute(&id), Err(Ok(Error::ThresholdNotMet)));
    assert_eq!(
        s.vault.try_revoke_approval(&s.signers[1], &id),
        Err(Ok(Error::NotApproved))
    );
}

#[test]
fn expired_proposals_cannot_be_approved_or_executed() {
    let s = setup();
    let id = s.vault.propose(
        &s.signers[0],
        &Action::Transfer(s.token.clone(), Address::generate(&s.env), 10),
        &deadline(&s.env),
    );
    s.vault.approve(&s.signers[1], &id);

    s.env.ledger().with_mut(|l| l.timestamp += 8 * DAY);

    assert_eq!(s.vault.try_execute(&id), Err(Ok(Error::Expired)));
    assert_eq!(
        s.vault.try_approve(&s.signers[2], &id),
        Err(Ok(Error::Expired))
    );
}

#[test]
fn rejects_past_deadlines_and_non_positive_transfers() {
    let s = setup();
    s.env.ledger().with_mut(|l| l.timestamp = 1_000);
    assert_eq!(
        s.vault
            .try_propose(&s.signers[0], &Action::SetThreshold(1), &1_000),
        Err(Ok(Error::InvalidExpiry))
    );
    assert_eq!(
        s.vault.try_propose(
            &s.signers[0],
            &Action::Transfer(s.token.clone(), Address::generate(&s.env), 0),
            &deadline(&s.env),
        ),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn signers_can_be_added_and_the_threshold_raised() {
    let s = setup();
    let newcomer = Address::generate(&s.env);

    let add = s.vault.propose(
        &s.signers[0],
        &Action::AddSigner(newcomer.clone()),
        &deadline(&s.env),
    );
    s.vault.approve(&s.signers[1], &add);
    s.vault.execute(&add);
    assert!(s.vault.signers().contains(&newcomer));

    let raise = s
        .vault
        .propose(&newcomer, &Action::SetThreshold(3), &deadline(&s.env));
    s.vault.approve(&s.signers[2], &raise);
    s.vault.execute(&raise);
    assert_eq!(s.vault.threshold(), 3);
}

#[test]
fn approvals_from_removed_signers_stop_counting() {
    let s = setup();
    // Signer 2 approves a payout, then gets removed by signers 0 and 1.
    let payout = s.vault.propose(
        &s.signers[2],
        &Action::Transfer(s.token.clone(), Address::generate(&s.env), 500),
        &deadline(&s.env),
    );
    s.vault.approve(&s.signers[0], &payout);

    let remove = s.vault.propose(
        &s.signers[0],
        &Action::RemoveSigner(s.signers[2].clone()),
        &deadline(&s.env),
    );
    s.vault.approve(&s.signers[1], &remove);
    s.vault.execute(&remove);
    assert!(!s.vault.signers().contains(&s.signers[2]));

    // Only signer 0's approval is still valid: 1 of 2.
    assert_eq!(
        s.vault.try_execute(&payout),
        Err(Ok(Error::ThresholdNotMet))
    );
}

#[test]
fn removing_a_signer_cannot_drop_below_the_threshold() {
    let env = Env::default();
    env.mock_all_auths();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let vault = MultisigVaultClient::new(
        &env,
        &env.register(MultisigVault, (vec![&env, a.clone(), b.clone()], 2u32)),
    );

    // Rejected up front: a 2-of-2 vault can't drop to one signer.
    assert_eq!(
        vault.try_propose(
            &a,
            &Action::RemoveSigner(b.clone()),
            &(env.ledger().timestamp() + DAY),
        ),
        Err(Ok(Error::InvalidThreshold))
    );
    // Removing someone who isn't a signer is rejected too.
    assert_eq!(
        vault.try_propose(
            &a,
            &Action::RemoveSigner(Address::generate(&env)),
            &(env.ledger().timestamp() + DAY),
        ),
        Err(Ok(Error::NotSigner))
    );
}

#[test]
fn threshold_must_stay_within_signer_count() {
    let s = setup();
    let id = s
        .vault
        .propose(&s.signers[0], &Action::SetThreshold(4), &deadline(&s.env));
    s.vault.approve(&s.signers[1], &id);
    assert_eq!(s.vault.try_execute(&id), Err(Ok(Error::InvalidThreshold)));
}

#[test]
fn only_the_proposer_can_cancel() {
    let s = setup();
    let id = s
        .vault
        .propose(&s.signers[0], &Action::SetThreshold(1), &deadline(&s.env));

    assert_eq!(
        s.vault.try_cancel(&s.signers[1], &id),
        Err(Ok(Error::NotProposer))
    );
    s.vault.cancel(&s.signers[0], &id);
    assert_eq!(s.vault.get_proposal(&id).status, ProposalStatus::Cancelled);
    assert_eq!(s.vault.try_execute(&id), Err(Ok(Error::NotPending)));
}

#[test]
#[should_panic]
fn approving_requires_the_signers_signature() {
    let s = setup();
    let id = s
        .vault
        .propose(&s.signers[0], &Action::SetThreshold(1), &deadline(&s.env));
    s.env.set_auths(&[]);
    s.vault.approve(&s.signers[1], &id);
}

#[test]
fn proposal_count_tracks_ids() {
    let s = setup();
    assert_eq!(s.vault.proposal_count(), 0);
    s.vault
        .propose(&s.signers[0], &Action::SetThreshold(1), &deadline(&s.env));
    s.vault
        .propose(&s.signers[1], &Action::SetThreshold(3), &deadline(&s.env));
    assert_eq!(s.vault.proposal_count(), 2);
}

#[test]
fn revoking_an_approval_emits_an_event() {
    use soroban_sdk::testutils::Events as _;
    let s = setup();
    let id = s
        .vault
        .propose(&s.signers[0], &Action::SetThreshold(1), &deadline(&s.env));
    s.vault.approve(&s.signers[1], &id);
    s.vault.revoke_approval(&s.signers[1], &id);
    assert_eq!(s.env.events().all().events().len(), 1);
    assert_eq!(s.vault.get_proposal(&id).approvals.len(), 1);
}

#[test]
fn proposals_can_carry_a_memo() {
    let s = setup();
    let note = soroban_sdk::String::from_str(&s.env, "Invoice #2041, Acme design work");
    let id = s.vault.propose_with_memo(
        &s.signers[0],
        &Action::SetThreshold(1),
        &deadline(&s.env),
        &note,
    );
    assert_eq!(s.vault.memo(&id), Some(note));
    let plain = s
        .vault
        .propose(&s.signers[0], &Action::SetThreshold(1), &deadline(&s.env));
    assert_eq!(s.vault.memo(&plain), None);

    let long = soroban_sdk::String::from_str(&s.env, &"x".repeat(141));
    assert_eq!(
        s.vault.try_propose_with_memo(
            &s.signers[0],
            &Action::SetThreshold(1),
            &deadline(&s.env),
            &long
        ),
        Err(Ok(Error::MemoTooLong))
    );
}
