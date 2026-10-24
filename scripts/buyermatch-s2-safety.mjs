// No CLI entrypoint, credentials, activation or default provider adapters.
// Future approved windows supply reviewed private adapters; tests use dummy adapters.
export const S2_SCOPE=Object.freeze({account:'acct_1UTRcRL6efr9LhPI',project:'qxhhlprentrufobpcgna',
  endpoint:'we_1UTTc1L6efr9LhPICbZjgCHA',livemode:false});
export async function restoreS2Pauses(scope,adapter){
  if(!scope||Object.entries(S2_SCOPE).some(([k,v])=>scope[k]!==v))throw Error('S2 scope mismatch; no operations attempted');
  // Both closures are attempted even when one fails; provider errors never escape.
  const closures=await Promise.allSettled([Promise.resolve().then(()=>adapter.disableEndpoint(S2_SCOPE)),
    Promise.resolve().then(()=>adapter.pauseReceiver(S2_SCOPE))]);
  let state;try{state=await adapter.readSafetyState(S2_SCOPE);}catch{throw Error('S2 pause verification unavailable; operator action required');}
  const required={endpointDisabled:true,receiverPaused:true,registrationPaused:true,checkoutPaused:true,
    liveBillingPaused:true,deliveryDisabled:true,protectionEnabled:true};
  if(!state||Object.entries(required).some(([k,v])=>state[k]!==v))throw Error('S2 safety assertion failed; operator action required');
  // A failed closure is reported even if readback now happens to be safe.
  if(closures.some(x=>x.status==='rejected'))throw Error('S2 closure operation failed; safe readback obtained but review required');
  return {scope:S2_SCOPE,verified:true};
}

export async function withApprovedS2Window(scope,adapter,run){
  if(!scope||Object.entries(S2_SCOPE).some(([k,v])=>scope[k]!==v))throw Error('S2 scope mismatch; no operations attempted');
  let operationFailed=false,result;
  try{await adapter.preflight(S2_SCOPE);result=await run();}catch{operationFailed=true;}
  finally{await restoreS2Pauses(scope,adapter);}
  if(operationFailed)throw Error('S2 operation failed; pauses verified restored');
  return result;
}
