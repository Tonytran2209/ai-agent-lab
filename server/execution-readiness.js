// Approval authorizes a ready plan; it does not supply missing evidence or answer questions.
export function executionReadiness(r){
 const d=r.draft;
 const blockers=[...(d?.questions||[]),...(d?.impact?.uncertaintyKind==='investigation'?[]:d?.impact?.uncertainty||[]),...(r.unresolvedCheckpoints||[])];
 // Legacy surveys sometimes hid an explicit prerequisite in assumptions instead of questions.
 for(const a of d?.assumptions||[])if(/^(?:checkpoint (?:trước|before)|(?:required|mandatory) (?:precondition|checkpoint)|điều kiện bắt buộc)/i.test(a.trim()))blockers.push(a);
 const checkpoints=d?.impact?.checkpoints||[];
 const details=[...new Set(blockers)].map(message=>{const c=checkpoints.find(c=>c.question===message);return {message,kind:c?.kind||'unclassified',reason:c?.reason||'',attempted:c?.attempted||[]};});
 return {details,needsUser:details.some(d=>['product-decision','access','external-evidence','unclassified'].includes(d.kind)),protocol:'execution-readiness-v1',ready:blockers.length===0,blockers:[...new Set(blockers)]};
}
