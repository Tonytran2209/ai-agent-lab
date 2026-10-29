// A terminal verification supersedes an earlier polling snapshot. Never invent shard results.
export function ciStatusSnapshot(r) {
 const observed=r.ciObservation,v=r.verification;
 const terminal=v?.source==='github-actions'&&v.phase==='passed';
 if(terminal&&(!observed||observed.commit!==r.result?.commit||observed.jobs.some(j=>j.status!=='completed'||j.conclusion!=='success')))
  return {commit:r.result?.commit,observedAt:v.at,jobs:[{name:'writer-check / browser-check',status:'completed',conclusion:'success',url:v.evidenceUrl}],summary:true};
 if(!observed)return null;
 const superseded=v?.phase==='failed'&&Date.parse(v.at)>Date.parse(observed.observedAt);
 return superseded?{...observed,historical:true}:observed;
}
