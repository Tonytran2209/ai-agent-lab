# Mac runner supervisor

The LaunchAgent starts `mac/supervisor.js` with the existing local config and credentials. The supervisor starts the runner as an IPC child; it never accepts a path, shell command, repo scope or model prompt from the control API.

Admin Settings → Project & tự động offers reconnect, login-status inspection and restart-when-idle. Commands target the persisted local worker UUID, are deduplicated, expire after ten minutes and retain their result. Reconnect wakes the next connection cycle. Restart waits for an explicitly idle runner, sends SIGTERM, waits for exit and confirms only after the new runner reconnects. No command bypasses request claims, scope, CI or approval.

The supervisor observes local IPC heartbeat separately from the remote connection. It gracefully stops a stalled idle child after three minutes and restarts exited children with durable backoff (at most three starts per ten-minute window). It never force-kills a busy coding process or discards its lock. A busy crash can leave detached tools alive: preserve the lock and require local inspection rather than risk duplicate writers. The child stops gracefully when its supervisor disconnects. The LaunchAgent KeepAlive setting remains the supervisor's OS-level recovery mechanism.

`codex login status` checks authentication only, with a 15-second deadline and no model call. Store only ready/login-required/unavailable plus timestamp, never raw account details. Login and expired credentials require the user on the Mac. An online supervisor or valid login is not evidence that a model request, repository check or deployment succeeded.

Existing installations need one local transition: update installed modules, change the existing start wrapper from runner.js to supervisor.js without changing its credential command, then restart the LaunchAgent when idle. New `mac/install.js` installations do this automatically. Do not run the installer over an existing installation merely to refresh the code: it also writes config.
