'use strict';
// Source-only review of a NOT-EXECUTED SQL Server SELECT template.
// Does not connect to SQL and cannot prove query success, RCSI, permissions
// or transactional consistency. Intentional static fail-closed checker.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,
 'comandas_reader_notes_single_select_v1_REVIEW_ONLY.sql'),'utf8');
function check(q){
 const s=q.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/--[^\n]*/g,' ');
 const stat=s.trim();
 const statements=stat.split(';').filter(z=>z.trim());
 if(statements.length!==1||!stat.trim().startsWith(';WITH recent AS'))
  return 'MUST_BE_SINGLE_READ_ONLY_CTE_SELECT';
 if(/\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|GRANT|REVOKE|DENY|EXEC(?:UTE)?|CREATE|OPENROWSET|OPENQUERY|BULK|WAITFOR|BACKUP|RESTORE)\b/i.test(s)||
    /\bNOLOCK\b/i.test(s))return 'FORBIDDEN_WRITE_OR_WEAKENED_READ';
 if(!/TOP\s*\(\s*@top\s*\)/i.test(s)||/\bTOP\s+\d+\b/i.test(s))
  return 'MUST_USE_BOUNDED_PARAMETER';
 if(!/c\.CDFILIAL\s*=\s*'0001'/i.test(s)||
    !/c\.CDLOJA\s*=\s*'01'/i.test(s)||
    !/c\.IDORGCMDVENDA\s*=\s*'DLV_IFO'/i.test(s))
  return 'ITAIM_DELIVERY_SCOPE_NOT_EXACT';
 const selected=/\)\s*SELECT\s+([\s\S]*?)\s+FROM\s+recent\s+r\b/i.exec(s);
 if(!selected)return 'SELECT_SHAPE_NOT_EXACT';
 if(/\*/.test(selected[1]))return 'WILDCARD_SELECT_FORBIDDEN';
 const actual=selected[1].split(',').map(v=>v.trim());
 const expected=[
 'r.CDFILIAL','r.CDLOJA','r.NRVENDAREST','r.NRCOMANDA',
 'r.NRCOMANDAEXT','r.IDORGCMDVENDA','r.IDSTCOMANDA','r.DTHRABERMESA',
 'i.NRPRODCOMVEN','i.CDPRODUTO','p.CDARVPROD','p.NMPRODUTO','i.QTPRODCOMVEN',
 'i.IDSTPRCOMVEN','c.DSOBSCOMANDA',
 'i.DSOBSDESCIT','i.DSOBSPEDDIGCMD','i.TXPRODCOMVEN'
 ];
 if(actual.length!==expected.length||actual.some((v,i)=>v!==expected[i]))
  return 'EXACT_NATIVE_SELECTED_COLUMNS_MISMATCH';
 if(/\b(NAME|PHONE|EMAIL|ADDRESS|CPF|CNPJ|CUSTOMER|FISCAL|NOMECLIENTE|TELEFONE|ENDERECO)\b/i.test(selected[1]))
  return 'POTENTIAL_CUSTOMER_DATA_SELECTED';
 const joins=[
  'ON c.CDFILIAL=r.CDFILIAL','AND c.CDLOJA=r.CDLOJA',
  'AND c.NRVENDAREST=r.NRVENDAREST','AND c.NRCOMANDA=r.NRCOMANDA',
  'ON i.CDFILIAL=r.CDFILIAL','AND i.NRVENDAREST=r.NRVENDAREST',
  'AND i.NRCOMANDA=r.NRCOMANDA',
  'ON p.CDPRODUTO=i.CDPRODUTO'
 ];
 if(joins.some(k=>!s.includes(k)))return 'REQUIRED_NATIVE_JOIN_MISSING';
 // The name is projected by the existing PRODUTO join, not an additional
 // query or join (which could amplify SQL load and row cardinality).
 if((s.match(/\bJOIN\s+TEKNISA\.PRODUTO\s+p\b/gi)||[]).length!==1||
    (s.match(/\bJOIN\b/gi)||[]).length!==4)
  return 'UNEXPECTED_JOIN_OR_SECOND_PRODUCT_LOOKUP';
 if(!/ORDER BY[\s\S]*i\.NRPRODCOMVEN\s+ASC/i.test(s))
  return 'NATIVE_LINE_ORDER_NOT_EXPLICIT';
 return 'STATIC_SELECT_REVIEW_PASS_NOT_EXECUTED';
}
let n=0;
const test=(name,fn)=>{fn();n++;};
test('existing join returns 18 columns including native product name',()=>assert.equal(
 check(sql),'STATIC_SELECT_REVIEW_PASS_NOT_EXECUTED'));
test('native product name cannot disappear',()=>assert.equal(
 check(sql.replace('p.NMPRODUTO,','')),'EXACT_NATIVE_SELECTED_COLUMNS_MISMATCH'));
test('name must come from already joined native product master',()=>assert.equal(
 check(sql.replace('p.NMPRODUTO,','i.NMPRODUTO,')),'EXACT_NATIVE_SELECTED_COLUMNS_MISMATCH'));
test('wrong native product join is rejected',()=>assert.equal(
 check(sql.replace('ON p.CDPRODUTO=i.CDPRODUTO','ON p.CDPRODUTO=i.NRPRODCOMVEN')),
 'REQUIRED_NATIVE_JOIN_MISSING'));
test('duplicate product join would add load and is rejected',()=>assert.equal(
 check(sql.replace('ORDER BY\n  r.DTHRABERMESA',
 'LEFT JOIN TEKNISA.PRODUTO AS p2 ON p2.CDPRODUTO=i.CDPRODUTO\nORDER BY\n  r.DTHRABERMESA')),
 'UNEXPECTED_JOIN_OR_SECOND_PRODUCT_LOOKUP'));
test('note field DSOBSPEDDIGCMD cannot disappear',()=>assert.equal(
 check(sql.replace('i.DSOBSPEDDIGCMD,','')),'EXACT_NATIVE_SELECTED_COLUMNS_MISMATCH'));
test('order note cannot disappear',()=>assert.equal(
 check(sql.replace('c.DSOBSCOMANDA,','')),'EXACT_NATIVE_SELECTED_COLUMNS_MISMATCH'));
test('production note cannot disappear',()=>assert.equal(
 check(sql.replace('i.TXPRODCOMVEN','i.SOMEOTHERFIELD')),'EXACT_NATIVE_SELECTED_COLUMNS_MISMATCH'));
test('no wildcard columns',()=>assert.equal(
 check(sql.replace('i.DSOBSDESCIT','i.*')),'WILDCARD_SELECT_FORBIDDEN'));
test('cannot omit store guard',()=>assert.equal(
 check(sql.replace("c.CDLOJA='01'","c.CDLOJA='02'")),'ITAIM_DELIVERY_SCOPE_NOT_EXACT'));
test('cannot broaden native delivery origin',()=>assert.equal(
 check(sql.replace("c.IDORGCMDVENDA='DLV_IFO'","c.IDORGCMDVENDA LIKE N'DLV[_]%'")),'ITAIM_DELIVERY_SCOPE_NOT_EXACT'));
test('cannot unbound native order TOP',()=>assert.equal(
 check(sql.replace('TOP (@top)','TOP (10000)')),'MUST_USE_BOUNDED_PARAMETER'));
test('cannot add UPDATE side effect',()=>assert.equal(
 check(sql+'UPDATE TEKNISA.COMANDAVEN SET x=1;'),'MUST_BE_SINGLE_READ_ONLY_CTE_SELECT'));
test('cannot introduce NOLOCK',()=>assert.equal(
 check(sql.replace('FROM TEKNISA.COMANDAVEN c','FROM TEKNISA.COMANDAVEN c WITH (NOLOCK)')),
 'FORBIDDEN_WRITE_OR_WEAKENED_READ'));
test('cannot lose exact four-part order join',()=>assert.equal(
 check(sql.replace('AND c.NRCOMANDA=r.NRCOMANDA','AND c.NRCOMANDA=r.NRVENDAREST')),
 'REQUIRED_NATIVE_JOIN_MISSING'));
test('cannot lose line-level item join',()=>assert.equal(
 check(sql.replace('AND i.NRCOMANDA=r.NRCOMANDA','AND i.NRCOMANDA=r.NRVENDAREST')),
 'REQUIRED_NATIVE_JOIN_MISSING'));
test('cannot omit line sort',()=>assert.equal(
 check(sql.replace('i.NRPRODCOMVEN ASC','i.CDPRODUTO ASC')),
 'NATIVE_LINE_ORDER_NOT_EXPLICIT'));
console.log('COMANDAS_NATIVE_ONE_SELECT_STATIC_REVIEW_PASS '+n+'/'+n+
 ' SQL_NOT_EXECUTED_CASHIER_UNCHANGED');
