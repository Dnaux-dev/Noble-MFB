CREATE TABLE memberships (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users (id),
  group_id          text NOT NULL REFERENCES groups (group_id),
  frequency         text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  cycle             text NOT NULL CHECK (cycle IN ('monthly', 'quarterly', 'bi_annual', 'annual')),
  contribution_kobo bigint NOT NULL CHECK (contribution_kobo > 0),
  weekday           smallint CHECK (weekday BETWEEN 1 AND 7),
  month_day         smallint CHECK (month_day BETWEEN 1 AND 28),
  month_last_day    boolean NOT NULL DEFAULT false,
  joined_on         date NOT NULL,
  cycle_start       date NOT NULL,
  cycle_end         date NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT day_matches_frequency CHECK (
    (frequency = 'daily'   AND weekday IS NULL     AND month_day IS NULL AND month_last_day = false)
 OR (frequency = 'weekly'  AND weekday IS NOT NULL AND month_day IS NULL AND month_last_day = false)
 OR (frequency = 'monthly' AND weekday IS NULL
       AND ((month_day IS NOT NULL AND month_last_day = false)
         OR (month_day IS NULL     AND month_last_day = true)))
  ),

  CONSTRAINT frequency_allows_cycle CHECK (
    (frequency = 'daily'   AND cycle = 'monthly')
 OR (frequency = 'weekly')
 OR (frequency = 'monthly' AND cycle <> 'monthly')
  ),

  CONSTRAINT cycle_starts_on_first CHECK (extract(day FROM cycle_start) = 1),
  CONSTRAINT cycle_ends_on_last_day CHECK (
    cycle_end = (date_trunc('month', cycle_end::timestamp) + interval '1 month' - interval '1 day')::date
  ),
  CONSTRAINT cycle_end_after_start CHECK (cycle_end > cycle_start)
);

CREATE INDEX memberships_user_id_idx ON memberships (user_id);
