import {digest} from './knowledge.js';
// Bounded local retrieval only: no embeddings, provider calls or source execution.
export function classificationContext(service,knowledge,r){
 const p=service.project(r.projectId),lib=service.library(r.libraryVersionId);
 if(p.classifierContextEnabled===false)return {protocol:'triage-context-v1',projectId:r.projectId,libraryVersionId:lib.id,commit:lib.sourceCommit,documents:[],lessons:[],reviewerExamples:[]};
 const query=[r.feedback,r.screen,r.expected].join(' '),found=knowledge.search(r.projectId,query,{libraryId:lib.id,limit:3});
 const documents=found.matches.map(n=>({path:n.path,startLine:n.startLine,endLine:n.endLine,contentHash:n.contentHash,commit:n.commit,excerpt:n.content.slice(0,1000)}));
 const overview=lib.documents.find(d=>d.path==='.agent-hub/project.md');
 if(overview&&!documents.some(d=>d.path===overview.path))documents.unshift({path:overview.path,contentHash:digest(overview.content),commit:lib.sourceCommit,excerpt:overview.content.slice(0,700)});
 const lessons=p.memoryEnabled===false?[]:service.memory.select(r).filter(m=>m.kind==='verified-outcome').slice(0,3).map(m=>({requestId:m.requestId,sourceCommit:m.sourceCommit,resultCommit:m.resultCommit,problem:m.problem.slice(0,400),resolution:m.verifiedSummary?.slice(0,500),initialRisk:m.classification?.risk,codexRisk:m.riskAssessment?.codexRisk||null,finalRisk:m.risk,policyAdjusted:m.riskAssessment?.policyAdjusted??null,policyReasons:m.riskAssessment?.policyReasons||[],assessment:m.riskAssessment?.reason?.slice(0,400),evidenceUrl:m.evidenceUrl,deploymentConfirmed:m.deploymentConfirmed,requiresSourceRevalidation:true}));
 const reviewerExamples=p.memoryEnabled===false?[]:service.memory.selectRiskFeedback(r).slice(0,2).map(m=>({requestId:m.requestId,systemRisk:m.systemRisk,reviewerRisk:m.reviewerRisk,reason:m.reason.slice(0,350),authority:'reviewer-feedback-only'}));
 return {protocol:'triage-context-v1',projectId:r.projectId,libraryVersionId:lib.id,commit:lib.sourceCommit,documents:documents.slice(0,4),lessons,reviewerExamples};
}
