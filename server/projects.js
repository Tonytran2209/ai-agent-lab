import { z } from 'zod';
import { fail } from './schemas.js';
export const repositorySchema = z.string().regex(/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/).max(180).refine(v=>!v.includes('..'));
export const projectIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/);
export const branchSchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/).refine(v=>!v.includes('..')&&!v.includes('//')&&!v.endsWith('/'));
export const projectOptions = z.object({enabled:z.boolean().optional(),runnerEnabled:z.boolean().optional(),releaseEnabled:z.boolean().optional(),releaseEnvironment:z.string().trim().max(200).optional()}).strict();
export function createProjects(db) {
  db.exec('CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, repository TEXT NOT NULL UNIQUE COLLATE NOCASE, data TEXT NOT NULL)');
  const get = id => {id=projectIdSchema.parse(id);const r=db.prepare('SELECT data FROM projects WHERE id=?').get(id);if(!r)fail('Không tìm thấy project.',404);return JSON.parse(r.data);};
  const list = () => db.prepare('SELECT data FROM projects ORDER BY rowid').all().map(r=>JSON.parse(r.data));
  const write = p => db.prepare('INSERT INTO projects(id,repository,data) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(p.id,p.repository,JSON.stringify(p));
  return {get,list,
    seed(lib, defaults={}) {if(!db.prepare('SELECT id FROM projects WHERE id=?').get(lib.projectId))write({id:lib.projectId,name:lib.name,repository:lib.repository,branch:lib.branch,libraryVersionId:lib.id,enabled:true,runnerEnabled:false,releaseEnabled:false,releaseEnvironment:'',...defaults});},
    updateLibrary(lib) {
      const old=list().find(p=>p.id===lib.projectId);
      if(old && (old.repository.toLowerCase()!==lib.repository.toLowerCase() || old.branch!==lib.branch))fail('Project ID đã gắn với repository/branch khác.',400);
      if(list().some(p=>p.id!==lib.projectId&&p.repository.toLowerCase()===lib.repository.toLowerCase()))fail('Repository đã kết nối với project khác.',400);
      const p={enabled:true,runnerEnabled:false,releaseEnabled:false,releaseEnvironment:'',...old,id:lib.projectId,name:lib.name,repository:lib.repository,branch:lib.branch,libraryVersionId:lib.id,ciReady:lib.ciReady??false};write(p);return p;
    },
    update(id,input) {const p=get(id),opts=projectOptions.parse(input);const next={...p,...opts};if(next.releaseEnabled&&!next.releaseEnvironment&&(opts.releaseEnabled===true||!p.releaseEnabled))fail('Cần chỉ định Railway environment trước khi bật phát hành.',400);write(next);return next;},
  };
}
