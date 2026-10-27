/** Server-only authorization boundary, not an IdP verifier or login implementation.
 * verifyIdentity must validate the provider's session/signature before returning.
 * lookupGrant is an authoritative server registry, never claims supplied by the UI.
 */
export interface VerifiedOperatorIdentity {
  issuer: string; audience: string; subject: string; authenticatedAtMs: number; expiresAtMs: number;
}
export interface OperatorReadGrant {
  issuer: string; subject: string; unitId: string; role: string; active: boolean;
  approvalRef: string; expiresAtMs: number;
}
export function createOperatorReadAuthority<T>(deps: {
  issuer: string; audience: string; unitId: string;
  verifyIdentity: (credential: string) => Promise<VerifiedOperatorIdentity | null>;
  lookupGrant: (issuer: string, subject: string, unitId: string) => Promise<OperatorReadGrant | null>;
  read: (unitId: string) => Promise<T>; now: () => number;
}) {
  const {issuer,audience,unitId,verifyIdentity,lookupGrant,read,now}=deps;
  if (![issuer,audience,unitId].every(v=>typeof v==='string'&&v.trim())) throw Error('OPERATOR_AUTH_CONFIGURATION_REQUIRED');
  const deny=(status:401|403|503,code:string)=>({ok:false as const,status,code,data:null});
  return async (credential: unknown, requestedUnit: unknown) => {
    if(typeof credential!=='string'||!credential.trim()||credential.length>16384)return deny(401,'IDENTITY_REQUIRED');
    if(typeof requestedUnit!=='string'||requestedUnit!==unitId)return deny(403,'UNIT_NOT_AUTHORIZED');
    let identity: VerifiedOperatorIdentity|null;
    try{identity=await verifyIdentity(credential);}catch{return deny(503,'IDENTITY_SERVICE_UNAVAILABLE');}
    const current=now();
    if(!Number.isFinite(current)||!identity||identity.issuer!==issuer||identity.audience!==audience||
      typeof identity.subject!=='string'||!identity.subject.trim()||identity.subject.length>512||
      !Number.isSafeInteger(identity.authenticatedAtMs)||!Number.isSafeInteger(identity.expiresAtMs)||
      identity.authenticatedAtMs>current||identity.expiresAtMs<=current||identity.expiresAtMs<=identity.authenticatedAtMs)
      return deny(401,'IDENTITY_INVALID_OR_EXPIRED');
    // Snapshot the verified fields; a mutable provider result cannot change scope while awaiting the registry.
    const subject=identity.subject,identityExpiry=identity.expiresAtMs;
    let grant: OperatorReadGrant|null;
    try{grant=await lookupGrant(issuer,subject,unitId);}catch{return deny(503,'AUTHORIZATION_SERVICE_UNAVAILABLE');}
    const checkedAt=now();
    if(!Number.isFinite(checkedAt)||checkedAt<current||identityExpiry<=checkedAt)return deny(401,'IDENTITY_INVALID_OR_EXPIRED');
    if(!grant||grant.active!==true||grant.issuer!==issuer||grant.subject!==subject||grant.unitId!==unitId||
      !['gerente','lider'].includes(grant.role)||typeof grant.approvalRef!=='string'||!grant.approvalRef.trim()||
      !Number.isSafeInteger(grant.expiresAtMs)||grant.expiresAtMs<=checkedAt)return deny(403,'OPERATOR_GRANT_REQUIRED');
    try{return {ok:true as const,status:200 as const,code:'AUTHORIZED_READ',data:await read(unitId)};}
    catch{return deny(503,'ORDER_SOURCE_UNAVAILABLE');}
  };
}
