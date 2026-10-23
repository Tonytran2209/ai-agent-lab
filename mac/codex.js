// Explicit defaults shared by Mac and cloud, independent of user UI configuration.
export function codexModelArgs(config,stage){
 const model=(stage==='planning'?config.planningModel:config.executionModel)||config.codexModel||'gpt-6.1-sol';
 if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(model))throw Error('Codex model không hợp lệ.');
 return ['--model',model];
}
