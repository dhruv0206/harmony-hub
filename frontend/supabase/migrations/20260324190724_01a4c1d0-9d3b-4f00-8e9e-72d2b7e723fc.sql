
DROP VIEW IF EXISTS recent_activities;
CREATE VIEW recent_activities WITH (security_invoker = true) AS
SELECT * FROM activities WHERE archived = false ORDER BY created_at DESC;
