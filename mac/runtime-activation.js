// Confirmation belongs to the process actually forked for this immutable runtime.
// An old child may still emit connected while gracefully draining its final loop.
export function activationMatches(launched,candidate,isCurrentChild){
 return Boolean(isCurrentChild&&candidate&&launched?.commit===candidate.commit&&launched?.entry===candidate.entry);
}
