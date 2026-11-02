# CI repair diagnostics

The Mac repair supervisor reports a bounded failure code (Codex exit, blocked report,
invalid report, changed HEAD, missing changes, scope violation, failed project check,
or generic worker failure) and an optional process exit status. Messages use fixed
text rather than raw provider errors. These fields grant no execution/retry/release
permission and do not change the existing two-attempt cap or claim rules.

Codex stdout/stderr remain on the execution Mac in
`<stateDir>/ci-repair-diagnostics/<requestId>-<attempt>.json`, in a mode-0700 directory
with mode-0600 files. They are not included in the report sent to Lab. Treat these
files as private diagnostics; inspect locally rather than uploading raw output.

Deploy the compatible server first, then update the Mac runtime from the trusted
installation source while the runner is safely idle. A server deployment or a
restart of an unchanged runtime alone does not install this worker change. Old
workers remain compatible but retain the old generic failure messages. Previously
discarded failure details cannot be reconstructed by this update.
