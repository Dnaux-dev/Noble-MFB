CREATE TABLE groups (
  group_id              text PRIMARY KEY,
  name                  text NOT NULL,
  min_contribution_kobo bigint NOT NULL CHECK (min_contribution_kobo > 0)
);

INSERT INTO groups (group_id, name, min_contribution_kobo) VALUES
  ('g-ajo',   'Ajo Weekly',    100000),
  ('g-esusu', 'Esusu Monthly', 500000);
