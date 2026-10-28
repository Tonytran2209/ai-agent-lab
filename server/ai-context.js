import {designDocumentAuthority,designReferencePolicy} from './design-authority.js';
// One policy version invalidates both persistent plans and prompt selection.
export const AI_POLICY_VERSION = 'economy-v1';
export function compactLibrary(library, layer = 'cross-layer') {
  const selected = (library.documents || []).filter(d => layer === 'cross-layer' || !/\/(backend|database|design)\//.test(d.path) || d.path.includes('/' + layer + '/'));
  return { projectId: library.projectId, sourceCommit: library.sourceCommit,
    designPolicy:designReferencePolicy, documents: selected.map(({path, content}) => ({path, content,...designDocumentAuthority(path)})), sourcePaths: library.sourcePaths };
}
export function feedbackLayer(request) {
  const text = [request.feedback, request.screen, request.expected].join(' ');
  // Only clear display-only vocabulary earns a narrower context. Ambiguity retains all layers.
  return /hiển thị|giao diện|display|preview|font|màu chữ/i.test(text) && !/database|cơ sở dữ liệu|api|đăng nhập|quyền|export|xuất|lưu|backend|payment/i.test(text) ? 'design' : 'cross-layer';
}
export function codingPacket(request, library) {
  const { sourcePaths, ...pinned } = compactLibrary(library, request.draft?.layer || 'cross-layer');
  return { request: Object.fromEntries(['id','workflowProtocol','projectId','repository','branch','baseCommit','libraryVersionId','contractProtocol','governanceProtocol','feedback','screen','reproduction','expected','classification','attachments','draft'].map(k => [k, request[k]])), library: pinned, surveyEvidence: request.ai?.evidence || [] };
}
// Exact, deliberately narrow recipe. Additional prose/requirements always use analysis.
export function displayRecipe(request, library) {
  if (library.projectId !== 'writer-studio') return null;
  const text = request.feedback.trim().replace(/[.!。]$/, '');
  if (!/^Thay thế ký tự dấu gạch ngang dài ['“]—['”] bằng dấu gạch ngang ngắn ['“]-['”] trong hiển thị bài viết Draft$/iu.test(text) || request.reproduction || request.expected || request.draft || request.result) return null;
  const paths = library.sourcePaths.filter(p => /(^|\/)Step4Draft\.tsx$/.test(p));
  if (paths.length !== 1) return null;
  return { title: 'Hiển thị dấu gạch ngang ngắn trong Draft', problem: text + '. Chỉ đổi khi hiển thị; giữ nguyên dữ liệu lưu, API và nội dung xuất.', layer: 'design', module: 'Draft', allowedPaths: paths,
    acceptanceCriteria: ["Bài viết Draft hiển thị ký tự '—' thành '-'.", 'Nội dung lưu và xuất giữ nguyên; các phần khác không thay đổi.'], assumptions: ['Chỉ chuẩn hóa phần hiển thị Draft.'], questions: [], risk: 'low', migrationNotes: '' };
}

export function planningLibrary(library){return {...library,documents:library.documents.map(d=>{const lines=d.content.split('\n');let size=0;const excerpt=[];for(const line of lines){if(size+line.length+1>3000)break;excerpt.push(line);size+=line.length+1;}return {path:d.path,...designDocumentAuthority(d.path),content:excerpt.join('\n'),excerpt:excerpt.length<lines.length,startLine:1,endLine:excerpt.length,totalLines:lines.length,readFullFromCheckout:excerpt.length<lines.length};})};}
