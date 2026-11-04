INSERT INTO users (email, full_name, password_hash) VALUES
  ('ada@example.com',   'Ada Obi',     crypt('Password123!', gen_salt('bf'))),
  ('tunde@example.com', 'Tunde Bello', crypt('Password123!', gen_salt('bf')))
ON CONFLICT DO NOTHING;
