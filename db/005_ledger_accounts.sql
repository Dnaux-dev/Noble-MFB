CREATE TABLE ledger_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL CHECK (type IN ('provider_clearing', 'savings_pool', 'credit', 'customer_payout')),
  membership_id uuid REFERENCES memberships (id),

  CONSTRAINT membership_matches_type CHECK (
    (type = 'provider_clearing' AND membership_id IS NULL)
 OR (type <> 'provider_clearing' AND membership_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX ledger_accounts_one_per_membership
  ON ledger_accounts (membership_id, type) WHERE membership_id IS NOT NULL;

CREATE UNIQUE INDEX ledger_accounts_one_clearing
  ON ledger_accounts (type) WHERE membership_id IS NULL;

INSERT INTO ledger_accounts (type) VALUES ('provider_clearing');
