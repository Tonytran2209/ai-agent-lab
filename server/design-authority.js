// Inclusion in the pinned library is provenance, not equal design authority.
export const primaryDesignDocument='.agent-hub/design/design.md';
export const supplementalDesignDocuments=['.agent-hub/design/CHATGPT-DESKTOP-UI-GUIDE.md'];
export const designReferencePolicy={primaryDocument:primaryDesignDocument,supplementalDocuments:supplementalDesignDocuments,rule:'design.md is the primary project design contract. Supplemental patterns are advisory; they never override it or authorize a redesign. Shared design-rule changes must explicitly update design.md within an authorized request.'};
export function designDocumentAuthority(path){
 if(path===primaryDesignDocument)return {authority:'primary-design',primaryDesignDocument};
 if(supplementalDesignDocuments.includes(path))return {authority:'supplemental-reference',primaryDesignDocument};
 return {};
}
