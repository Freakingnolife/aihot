-- A grouping job may be capped after it writes article membership but before a two-model story
-- consolidation finishes. Keep that continuation explicit so a retry does not hit the membership
-- shortcut and silently declare the article done.
CREATE TABLE group_consolidation_pending (
  article_id text PRIMARY KEY REFERENCES articles (id) ON DELETE CASCADE,
  story_ids bigint[] NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now()
);
