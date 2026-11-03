'use strict';
/**
 * Advisory, pure lab check for isolation and Reader query candidates.
 * NEVER proves that actual session/DB/result are authentic: caller supplies
 * all evidence. Cannot authorize printing, sequence, SQL or live order export.
 *
 * SQL Server: READ COMMITTED + RCSI ON => statement-level versioned read.
 * SNAPSHOT requires ALLOW_SNAPSHOT_ISOLATION ON AND an actual snapshot
 * transaction. This validator does not inspect the transaction; it keeps HOLD.
 */
const SCHEMA='tata.comandas.reader-sql-consistency-review.v1';
const shape=(obj,keys)=>obj!==null&&typeof obj==='object'&&!Array.isArray(obj)&&
 Object.keys(obj).length===keys.length&&keys.every(k=>Object.hasOwn(obj,k));
const deny=(reason,eligible=false)=>Object.freeze({
 schema:SCHEMA,state:'HOLD',reason,
 eligibleToConsiderSingleStatementSnapshot:eligible,
 databaseSettingsIndependentlyProven:false,
 runningReaderIdentityProven:false,
 actualTransactionIsolationProven:false,
 actualStatementSnapshotProven:false,
 sourceRevisionAuthenticated:false,
 sourceReadExhaustionProven:false,
 readerOrderDetailProven:false,
 independentIfoodIdentityProven:false,
 ordersPublishable:0,printAuthorized:false,
 clientActionsExecuted:0,
 nextGate:'APPROVED_READER_RUNTIME_AND_SQL_METADATA_ATTESTATION'
});
function review(input){
 try{
  if(!shape(input,['schema','metadata','proposal'])||
      input.schema!=='tata.comandas.reader-sql-consistency-input.v1')
   return deny('INVALID_INPUT');
  const {metadata:m,proposal:p}=input;
  if(!shape(m,['database_name','current_login','is_read_committed_snapshot_on',
    'snapshot_isolation_state_desc'])||
    !shape(p,['statement_count','isolation_level','target_orders',
      'uses_nolock','reader_host','unit','source_query_kind']))
   return deny('INCOMPLETE_METADATA_OR_PROPOSAL');
  if(m.database_name!=='teknisa'||m.current_login!=='NT SERVICE\\TataComandaReader')
   return deny('DB_OR_CONFIGURED_READER_LOGIN_MISMATCH');
  if(p.reader_host!=='CAIXA_MOOCA'||p.unit!=='ITAIM'||
    p.source_query_kind!=='NATIVE_HEADER_ITEMS_AND_NOTES')
   return deny('HOST_UNIT_OR_SOURCE_QUERY_SCOPE_MISMATCH');
  if(p.statement_count!==1||p.target_orders!==1||p.uses_nolock!==false)
   return deny('SINGLE_BOUNDED_ORDER_OR_NOLOCK_POLICY_FAILED');
  if(![0,1].includes(m.is_read_committed_snapshot_on)||
    !['ON','OFF','IN_TRANSITION_TO_ON','IN_TRANSITION_TO_OFF'].includes(
      m.snapshot_isolation_state_desc))
   return deny('ISOLATION_SETTINGS_MISSING_OR_UNKNOWN');
  if(p.isolation_level==='READ_COMMITTED'&&m.is_read_committed_snapshot_on===1)
    return deny('CONFIG_ELIGIBLE_BUT_NOT_ATTESTED',true);
  if(p.isolation_level==='SNAPSHOT'&&m.snapshot_isolation_state_desc==='ON')
    return deny('SNAPSHOT_SETTING_ON_BUT_ACTUAL_TRANSACTION_NOT_ATTESTED',true);
  if(p.isolation_level==='READ_COMMITTED'&&m.is_read_committed_snapshot_on===0)
    return deny('READ_COMMITTED_LOCKING_DOES_NOT_PROVE_STATEMENT_SNAPSHOT');
  if(p.isolation_level==='SNAPSHOT'&&m.snapshot_isolation_state_desc!=='ON')
    return deny('SNAPSHOT_ISOLATION_NOT_ENABLED');
  return deny('SESSION_ISOLATION_NOT_ALLOWED_FOR_LOW_IMPACT_CAPTURE');
 }catch{return deny('SOURCE_ISOLATION_REVIEW_EXCEPTION');}
}
module.exports={review,SCHEMA};
