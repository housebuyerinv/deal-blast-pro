export type ClosingAggregateInput={workspace_id:string;city:string;state:string;postal_code:string}
export function aggregateHotZones(rows:ClosingAggregateInput[],scope:'workspace'|'shared',options:{workspaceMinimum:number;sharedMinimum:number;sharedWorkspaceMinimum:number}){
  if(scope==='workspace'&&rows.length<options.workspaceMinimum)return[]
  const buckets=new Map<string,{city:string;state:string;postalCode:string;count:number;workspaces:Set<string>}>()
  for(const row of rows){const key=`${row.postal_code}|${row.city}|${row.state}`;const bucket=buckets.get(key)||{city:row.city,state:row.state,postalCode:row.postal_code,count:0,workspaces:new Set<string>()};bucket.count+=1;bucket.workspaces.add(row.workspace_id);buckets.set(key,bucket)}
  return[...buckets.values()].filter(item=>scope==='workspace'||(item.count>=options.sharedMinimum&&item.workspaces.size>=options.sharedWorkspaceMinimum)).sort((a,b)=>b.count-a.count).map(({workspaces:_private,...item},index)=>({rank:index+1,...item}))
}
