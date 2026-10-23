// Model-visible definitions match the independently enforced impact domains.
// These are policy categories, not benchmark examples or learned permissions.
export const riskRubric={
 version:'risk-brief-v1',
 high:'Authentication/xác thực, authorization/phân quyền/quyền truy cập, billing/payments/thanh toán, schema/database migrations, destructive operations/data loss, infrastructure, secrets or policy changes. A change to access decisions or a migration is high even when the implementation looks small or reversible.',
 medium:'State synchronization, persisted state, workflow transitions/checkpoints, business logic, API behavior, exports, caching correctness or performance, new files. Restoring saved selections, saving existing data and fixing workflow state are medium when they do not involve the high domains above.',
 low:'Only bounded display/copy/layout/spacing/style in existing UI, preserving state, saved data, workflow behavior, API contracts and exports. Do not label state/workflow/API/migration/access behavior low merely because it is called a small bug fix.',
 uncertainty:'Unknown scope is at least medium; low confidence never lowers risk. Report confidence and missing evidence separately. High needs admin; medium can run automatically only after source-grounded scope, behavioral tests, rollback, CI and release policy are satisfied.'
};
