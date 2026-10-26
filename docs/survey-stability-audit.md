# Read-only survey stability audit (2026-10-26)

The message “Codex đang đọc code ở chế độ chỉ đọc; chưa được sửa file” describes the survey lease, not an exception or a write-permission request. The survey must remain read-only until the server validates a source-grounded scope and grants a separate execution claim.

## Observed incident

REQ-6CB63912 was claimed at 03:16:36 UTC, read relevant files through five tool calls, and last emitted an event at 03:17:07 UTC. Worker heartbeats continued without a completed plan. Its workspace stayed unchanged. Earlier REQ-2DC6D6B3 surveys showed the same pattern; that request was subsequently recovered with an explicitly manual plan and deployed after independent CI. That recovery does not prove the survey defect was resolved.

The silence occurs inside the Codex invocation, before JSON/source validation, server plan reporting, execution, PR or CI. Small live probes of JSON schemas and tool round trips passed. No evidence establishes a globally broken login, schema, or tool-host feature; do not disable the sandbox or change models as a guessed workaround.

## Code findings and fixes

- Direct surveys were still assembled with legacy impact/diagnostic instructions, including a second vocabulary for verification and redundant constraints. Direct surveys now use a separate concise contract, while legacy requests retain their contract.
- Pinned MD text was duplicated in the prompt even though the agent reads it from the checkout. Direct surveys now send an exact reading manifest and retain source paths, original feedback/images, scope policy and provenance-bound lesson summaries. Relevant complete MD must still be read locally. The observed prompt shrank from 30,209 to approximately 10,715 characters before source tool outputs.
- Process timeout errors discarded all diagnostic process metadata. Retain only bounded counters, exit/termination status and static authentication/rate/schema/transport/permission categories in a private job diagnostic file. Never store provider bodies, model text, tool arguments or credentials in that diagnostic.
- pollPlanning swallowed survey failures, making an unsuccessful cloud cycle appear successful and omitting the normal supervisor failure log. Failures now propagate after restoring polling telemetry.
- A completed shell read was labelled reading-source while the model was actually the next pending step. JSON activity now distinguishes an active command from waiting for the model.

## Boundaries and remaining verification

These fixes remove conflicting/duplicated context and improve failure attribution; they do not establish the internal cause of the provider's silent turn. A fresh live survey on the revised contract must complete before claiming recovery. Keep finite deadlines, the three-attempt/daily budgets, pinned source/attachment checks, scope validation, FIFO, high-risk consent and exact-head CI/release gates. Never reset attempts or pass an incomplete plan to execution. No automatic paid retry is added.
