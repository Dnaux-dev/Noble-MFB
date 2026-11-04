CREATE TABLE journal_transactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL CHECK (kind IN ('inflow', 'payout', 'reversal')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE journal_entries (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  txn_id      uuid   NOT NULL REFERENCES journal_transactions (id),
  account_id  uuid   NOT NULL REFERENCES ledger_accounts (id),
  amount_kobo bigint NOT NULL CHECK (amount_kobo <> 0)
);

CREATE INDEX journal_entries_txn_idx     ON journal_entries (txn_id);
CREATE INDEX journal_entries_account_idx ON journal_entries (account_id);

CREATE FUNCTION check_txn_balanced() RETURNS trigger AS $$
DECLARE
  v_txn   uuid;
  v_sum   bigint;
  v_count integer;
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    v_txn := NEW.txn_id;
  ELSE
    v_txn := NEW.id;
  END IF;

  SELECT COALESCE(SUM(amount_kobo), 0), COUNT(*)
    INTO v_sum, v_count
    FROM journal_entries
   WHERE txn_id = v_txn;

  IF v_count < 2 THEN
    RAISE EXCEPTION 'journal transaction % has fewer than 2 entries', v_txn;
  END IF;
  IF v_sum <> 0 THEN
    RAISE EXCEPTION 'journal transaction % does not sum to zero (sum = %)', v_txn, v_sum;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER entries_balanced
  AFTER INSERT ON journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_txn_balanced();

CREATE CONSTRAINT TRIGGER txn_has_entries
  AFTER INSERT ON journal_transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_txn_balanced();

CREATE FUNCTION forbid_ledger_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only: % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entries_append_only
  BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();

CREATE TRIGGER transactions_append_only
  BEFORE UPDATE OR DELETE ON journal_transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();
