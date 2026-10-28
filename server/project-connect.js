import {z} from 'zod';
import {repositorySchema,branchSchema,projectIdSchema} from './projects.js';
import {canonicalDocuments,parseProjectContract} from './library.js';
import {inspectAdapters} from './ci-adapters.js';
import {fail} from './schemas.js';
export const inspectProjectInput=z.object({repository:repositorySchema,branch:branchSchema.optional()}).strict();
export const connectProjectInput=inspectProjectInput.extend({expectedCommit:z.string().regex(/^[a-f0-9]{40}$/),projectId:projectIdSchema.optional(),name:z.string().trim().min(1).max(120).regex(/^[^\r\n]+$/).optional(),surveyConsent:z.boolean().default(false)}).strict();
export async function inspectProject(input,api){
 const v=inspectProjectInput.parse(input),meta=await api(v.repository);if(!meta.full_name||meta.full_name.toLowerCase()!==v.repository.toLowerCase()||meta.archived||meta.disabled)fail('Repository không phù hợp.');
 const repository=repositorySchema.parse(meta.full_name),branch=branchSchema.parse(v.branch||meta.default_branch),head=await api(repository+'/commits/'+encodeURIComponent(branch));if(!/^[a-f0-9]{40}$/.test(head.sha))fail('Không xác minh được commit GitHub.');
 const tree=await api(repository+'/git/trees/'+head.sha+'?recursive=1');if(tree.truncated)fail('Source tree chưa đầy đủ.');const paths=tree.tree.filter(f=>f.type==='blob').map(f=>f.path);
 const missingDocuments=canonicalDocuments.filter(p=>!tree.tree.some(f=>f.path===p&&f.type==='blob'&&f.mode==='100644'));
 let identity=null;if(paths.includes('.agent-hub/project.md')){const b=await api(repository+'/contents/.agent-hub/project.md?ref='+head.sha);if(b.type!=='file'||b.encoding!=='base64'||b.size>120000)fail('project.md không hợp lệ.');identity=parseProjectContract(Buffer.from(b.content,'base64').toString('utf8'),repository);}
 return {repository,branch,commit:head.sha,missingDocuments,identity,mode:missingDocuments.length?'onboarding':'direct',ci:inspectAdapters(paths)};
}
