// The admin-selected Lab model overrides local defaults for new Mac/cloud runs.
export function codexModelArgs(config,stage,ai={}){
 const model=ai.mainModel||(stage==='planning'?config.planningModel:config.executionModel)||config.codexModel||'gpt-6.1-sol';
 if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(model))throw Error('Codex model không hợp lệ.');
 return ['--model',model];
}
