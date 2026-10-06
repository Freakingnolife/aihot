-- Key phrases of a selected item's "Why it matters" sentence, shown in bold. They are words of
-- publications.reason itself, checked again whenever the item is published (a manual rewrite of the
-- sentence drops them). Additive: existing rows start with none.
ALTER TABLE publications ADD COLUMN IF NOT EXISTS reason_phrases text[] NOT NULL DEFAULT '{}';
