# Isolated A2A staging

Deploy branch `staging/a2a` from the same repository into an empty Railway environment named `staging-a2a`. Main/production and the installed production Mac runner are not changed by this branch.

## Railway

- Attach a NEW volume at `/data`, set `DATA_DIR=/data`, one replica. Never reuse production DB/volume, exports or external storage credentials.
- Use a new domain, APP_URL, ADMIN_PASSWORD, USER_PASSWORD, SESSION_SECRET and MCP_TOKEN. Do not attach production runner to this URL.
- Railway's `RAILWAY_ENVIRONMENT_NAME=staging-a2a` disables built-in Writer/Intercom bootstrapping and removes only their unused exact seed registrations. Immutable libraries are retained, not exposed as active projects.
- For another environment name set `LAB_ENVIRONMENT=staging`, `LAB_BOOTSTRAP_DEFAULT_PROJECTS=false`, `LAB_REMOVE_UNUSED_DEFAULT_PROJECTS=true` explicitly.
- Cleanup refuses production, and refuses the entire cleanup if either default project has any request history. Use a fresh staging volume in that case; do not delete production history. Set `LAB_REMOVE_UNUSED_DEFAULT_PROJECTS=false` after cleanup if desired. Never re-enable bootstrap on staging.
- A clean database has no connected projects. `/api/config` returns project:null; UI offers “Kết nối project đầu tiên”. Stale browser project selection falls back to a registered project, never to Writer.

## Test project and runner

Create an independent test repo (for example `Tonytran2209/agent-lab-a2a-test`) and connect only it through Settings. New connections do not enable worker/release implicitly. Do not connect Writer/Intercom, copy their deploy bindings, Lark settings, cloud dispatch secrets, or broad production tokens. Scope staging GitHub credentials to the test repo only. Use a separate Railway test target for that app.

Keep the production LaunchAgent/config/token/state unchanged. A staging runner needs its own installation directory, config, MCP URL/token, state/log/lock/workspace and LaunchAgent label. Do not run the current default installer if it overwrites the existing production service. A dedicated staging installer/A2A adapter is a separate implementation step: this change creates a clean staging Lab, not an A2A runtime.

## Verification

Log in on the staging domain: no Writer/Intercom cards or old production feedback. Add the test repo: verify runner/release remain off until configured. Redeploy: no seed projects reappear. Production keeps existing defaults unless explicitly configured otherwise. Never merge environment-specific settings or secrets into main.
