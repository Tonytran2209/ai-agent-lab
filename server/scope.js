// Admission policy is owned by Lab, not by text in project documents or a model.
const layers={
 design:p=>/^(src\/components\/|src\/[^/]+\.css$|src\/App\.tsx$|public\/|index\.html$|\.agent-hub\/design\/)/.test(p),
 backend:p=>/^(backend\/|src\/lib\/(aiService|db|railway[^/]*)\.ts$|\.agent-hub\/backend\/)/.test(p),
 database:p=>/^(supabase\/migrations\/|backend\/supabase\.ts$|\.agent-hub\/database\/)/.test(p),
};
export const scopePolicy={version:'scope-v2',testRoots:['tests/browser/','tests/agent-lab/'],newTests:'Exact .spec/.test JS/TS files in an existing project test root; include the source being tested. Test-only scope does not raise behavioral risk; production source and sensitive domains decide.',forbidden:'CI/workflow files, package manifests, secrets and arbitrary new helpers are not admitted by the test exception.'};
export function rejectedScopePaths(draft,library){
 const exists=p=>library.sourcePaths.includes(p);
 const frontend=p=>exists(p)&&/^src\/(hooks|contexts?|utils|types|pages|views|lib)\/.*\.[cm]?[jt]sx?$/.test(p)&&!layers.backend(p);
 const owns=draft.layer==='cross-layer'?p=>Object.values(layers).some(fn=>fn(p))||frontend(p):draft.layer==='design'?p=>layers.design(p)||frontend(p):layers[draft.layer];
 const root=p=>scopePolicy.testRoots.find(dir=>p.startsWith(dir));
 const established=dir=>library.sourcePaths.some(p=>p.startsWith(dir)&&/\.(spec|test)\.[cm]?[jt]sx?$/.test(p));
 const hasSource=[...draft.allowedPaths,...(draft.impact?.evidencePaths||[])].some(p=>!root(p)&&(owns(p)||library.documents.some(d=>d.path===p)));
 const test=p=>{const dir=root(p);if(!dir||!hasSource)return false;
  if(exists(p)&&/\.[cm]?[jt]sx?$/.test(p))return true;
  const suffix=p.match(/\.(spec|test)\.[cm]?[jt]sx?$/)?.[0];
  return established(dir)&&suffix&&library.sourcePaths.some(f=>f.startsWith(dir)&&f.endsWith(suffix))&&new RegExp('^'+dir.replaceAll('/','\\/')+'[A-Za-z0-9_-]+\\.(spec|test)\\.[cm]?[jt]sx?$').test(p);
 };
 return draft.allowedPaths.filter(p=>!owns(p)&&!library.documents.some(d=>d.path===p)&&!test(p)&&!/^tests\/agent-lab\/[^/]+\.(spec|test)\.[cm]?[jt]sx?$/.test(p));
}
