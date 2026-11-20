/** UI state only. Authentication and permitted destinations are decided on the server. */
export type EntranceStage='idle'|'typing'|'authenticating'|'rejected'|'accepted'|'opening'|'entering';
export type EntranceResult={error:string;outcome:'idle'|'invalid'|'limited'|'rejected'|'accepted'|'unavailable';destination?:string};
export const ENTRANCE_TIMING={unlock:280,open:1500,finish:2350};
export function entranceStage(pending:boolean,result:EntranceResult,dirty:boolean,phase:EntranceStage):EntranceStage{
 if(pending)return 'authenticating';
 if(result.outcome==='accepted'&&result.destination)return phase;
 if(result.outcome==='rejected'&&!dirty)return 'rejected';
 return dirty?'typing':'idle';
}
