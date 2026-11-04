CREATE TABLE data_conflicts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_ref       text  NOT NULL,
  existing_inflow_id uuid  NOT NULL REFERENCES inflows (id),
  payload            jsonb NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX data_conflicts_provider_ref_idx ON data_conflicts (provider_ref);

CREATE TRIGGER data_conflicts_append_only
  BEFORE UPDATE OR DELETE ON data_conflicts
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();

CREATE TABLE payouts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id  uuid   NOT NULL REFERENCES memberships (id),
  journal_txn_id uuid   NOT NULL,
  amount_kobo    bigint NOT NULL CHECK (amount_kobo > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payouts_membership_unique   UNIQUE (membership_id),
  CONSTRAINT payouts_journal_txn_unique  UNIQUE (journal_txn_id),
  CONSTRAINT payouts_journal_txn_fk FOREIGN KEY (journal_txn_id)
    REFERENCES journal_transactions (id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TRIGGER payouts_append_only
  BEFORE UPDATE OR DELETE ON payouts
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();

CREATE TABLE idempotency_keys (
  scope         text NOT NULL CHECK (scope IN ('payout', 'contribution')),
  key           text NOT NULL CHECK (length(key) > 0),
  membership_id uuid NOT NULL REFERENCES memberships (id),
  inflow_id     uuid REFERENCES inflows (id),
  payout_id     uuid REFERENCES payouts (id),
  response      jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (scope, key),

  CONSTRAINT idempotency_scope_matches_link CHECK (
    (scope = 'payout'       AND payout_id IS NOT NULL AND inflow_id IS NULL)
 OR (scope = 'contribution' AND inflow_id IS NOT NULL AND payout_id IS NULL)
  )
);

CREATE TRIGGER idempotency_keys_append_only
  BEFORE UPDATE OR DELETE ON idempotency_keys
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();
