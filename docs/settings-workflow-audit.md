# Settings and workflow alignment

Reviewed 2026-10-26. The UI groups controls by function: Project & automation, AI & model, MD & experience, Lark notifications. Server policy remains authoritative.

| Setting | Persisted value / runtime consumer | Meaning |
| --- | --- | --- |
| Activate project | `projects.enabled`; feedback admission and worker queues | Pauses new feedback and new claims; does not terminate a running OS process. |
| Allow workers | `runnerEnabled`; runner project discovery and claims | Mac and cloud access remain separately configured. |
| Approval policy | `automationMode`; `decideAutomation` | Medium automation additionally needs scope, regression plans, CI and bound release consent. High and unresolved decisions remain reviewable. |
| Project AI classification | `agentEnabled` + global orchestrator mode/key | An enabled project switch alone does not mean classification is operational. |
| Automatic CI repair | `ciRepairEnabled`; `createCiRepair` | At most two scoped low/medium attempts on the same PR with existing delivery authority. |
| Survey budget | `planningDailyBudget`; local-planning claim | Daily UTC cap, also bounded by worker limit and three attempts per feedback. |
| Publication | `releaseEnabled`, `releaseEnvironment`, `autoCompleteAfterApproval` | Automatic completion requires CI; Mac publisher additionally requires its local release switch. |
| Post-deploy check | `postDeployUrl`; publisher | Optional HTTP 2xx check on permitted Railway URL; failure does not imply rollback. |
| CI setup | `ciSetup` / `ciReady` | Configuration availability is distinct from a passing CI run for a particular request commit. |
| Cloud fallback | cloud `enabled`, `publishEnabled`, `dailyDispatches` | Dispatches when Mac is offline and work is queued. Enabled is not proof of credentials/workflow success. |
| Codex model | `mainModel` in survey/execution packets | Applies to new work; blank delegates to worker configuration. Saving this field does not save unsaved classification settings. |
| Classification model and budget | orchestrator model/mode/dailyTokens | Model activation retains evaluations. The classify strategy uses one model call per feedback; provider and token limits still apply. |
| MD refresh | `autoSync`, `syncMinutes`; maintenance | Imports reference MD from GitHub; does not edit the repository. Publication also has a separate post-deploy library sync. |
| Classifier context | `classifierContextEnabled` | Adds bounded pinned MD and eligible enabled memory, without source scanning or embeddings. |
| Verified memory | `memoryEnabled` | Controls retrieved project examples for classification and Codex. Does not train weights or grant permissions. |
| Embeddings | `semanticEnabled` | Optional manual knowledge search, not the default feedback classifier. |
| Background improvement | learning enabled/budget/autoActivate | Evaluates prompt/context candidates with human labels and independent cases; not model-weight training. |
| Lark | encrypted Lark settings and durable message queue | One updated private card per request. Save configuration before sending a test. |

## Corrections

- Runtime workflow/classifier metadata now drives project summaries instead of unconditional “Luna → automatic deploy” text.
- Approval descriptions follow the selected mode; medium automation shows missing prerequisites.
- Settings panels have explicit subgroup spacing. CI readiness, publication, model selection and learning names describe their actual roles.
- Re-saving unchanged enabled authority values preserves the existing configuration revision and pending publication consent. Actual changes and explicit disable commands still invalidate consent, including pending CI onboarding that would otherwise enable release later.
- Codex model and classifier/MD form saves are isolated; Lark testing is unavailable while edits are unsaved.
- Knowledge data refreshes when the current library pointer changes.

Validation: settings-state and publication regression tests, full application checks, local browser verification of all four tabs and isolated model saving. No production permission switches or model/budget values are changed by this UI update.

Observed production configuration at review: Codex main model `gpt-6.1-sol`; classifier `gpt-6-luna` enabled with an API key; both projects enabled with medium automation and CI repair. Writer Studio had background evaluation and activation enabled but zero human labels/holdouts, so it correctly remained on baseline with zero evaluation tokens used. Lark was off and unconfigured; no send test was performed.
