CREATE INDEX sessions_expiry ON sessions(owner_id,expires_at);
CREATE INDEX devices_expiry ON sync_devices(owner_id,expires_at);
CREATE INDEX rate_expiry ON rate_limits(expires_at);
CREATE INDEX challenges_expiry ON challenges(expires_at);
CREATE INDEX deletion_expiry ON deletion_jobs(complete,expires_at);
CREATE INDEX deletion_owner ON deletion_jobs(owner_id);
CREATE INDEX ideas_owner_id ON ideas(owner_id,id);
