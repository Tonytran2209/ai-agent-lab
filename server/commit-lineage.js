// Bounded, single-parent fast-forward repair history. Never accept a merge/rewrite.
export async function verifyArtifactLineage(api,base,head,anchor=head){
 if(![base,head,anchor].every(v=>/^[a-f0-9]{40}$/.test(v)))throw Error('Artifact sai commit.');
 let sha=head,found=false;
 for(let n=0;n<8&&sha!==base;n++){
  if(sha===anchor)found=true;
  const commit=await api('commits/'+sha);
  if(commit.sha&&commit.sha!==sha||commit.parents?.length!==1)throw Error('Artifact phải có lịch sử tuyến tính từ base đã duyệt.');
  sha=commit.parents[0].sha;
 }
 if(sha!==base||!found||head===base)throw Error('Artifact phải có lịch sử tuyến tính từ base đã duyệt, giữ commit đã báo cáo.');
}
