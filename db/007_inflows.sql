CREATE TABLE inflows (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_ref   text   NOT NULL CHECK (length(provider_ref) > 0),
  membership_id  uuid   NOT NULL REFERENCES memberships (id),
  amount_kobo    bigint NOT NULL CHECK (amount_kobo > 0),
  received_at    timestamptz NOT NULL,
  source         text   NOT NULL CHECK (source IN ('webhook', 'simulated')),
  outcome        text   NOT NULL CHECK (outcome IN ('posted', 'held_as_credit')),
  journal_txn_id uuid   NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT inflows_provider_ref_unique UNIQUE (provider_ref),
  CONSTRAINT inflows_journal_txn_unique  UNIQUE (journal_txn_id),
  CONSTRAINT inflows_journal_txn_fk FOREIGN KEY (journal_txn_id)
    REFERENCES journal_transactions (id) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX inflows_membership_received_idx ON inflows (membership_id, received_at);

CREATE TRIGGER inflows_append_only
  BEFORE UPDATE OR DELETE ON inflows
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();
