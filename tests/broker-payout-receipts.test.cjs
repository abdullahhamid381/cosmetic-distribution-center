const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,dependencies={}){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>Object.hasOwn(dependencies,name)?dependencies[name]:require(name),exports);return exports;}

test('broker receipt upsert uses the payout identity and caller transaction',async()=>{
 const {saveBrokerPayoutReceipt}=load('lib/broker-payout-receipts.ts');
 const calls=[],data=Buffer.from('%PDF-1.7\n');
 await saveBrokerPayoutReceipt({query:async(sql,args)=>{calls.push({sql,args});}},7,{name:'bank-slip.pdf',mime:'application/pdf',data},3);
 assert.equal(calls.length,1);assert.match(calls[0].sql,/INSERT INTO broker_payout_receipts/);assert.match(calls[0].sql,/ON CONFLICT\(payout_id\) DO UPDATE/);assert.match(calls[0].sql,/uploaded_at=NOW\(\)/);assert.deepEqual(calls[0].args,[7,'bank-slip.pdf','application/pdf',data,3]);
});

function route(role='ADMIN',receipt={file_name:'bank slip.pdf',content_type:'application/pdf',file_data:Buffer.from('%PDF-1.7\n')}){
 const queries=[];
 const api=load('app/api/broker-payouts/[id]/receipt/route.ts',{'@/lib/auth':{currentUser:async()=>role?{role}:null},'@/lib/db':{query:async(sql,args)=>{queries.push({sql,args});return receipt?[receipt]:[];}}});
 return {...api,queries};
}
const request=(download=false)=>new Request('https://example.test/api/broker-payouts/7/receipt'+(download?'?download=1':''));
const params=id=>({params:Promise.resolve({id})});

test('broker receipts require an accounts, manager or admin session before reading',async()=>{
 for(const [role,status] of [[null,401],['SALES',403],['WAREHOUSE',403],['DELIVERY',403]]){
  const h=route(role);assert.equal((await h.GET(request(),params('7'))).status,status);assert.equal(h.queries.length,0);
 }
 for(const role of ['ADMIN','MANAGER','ACCOUNTS']){const h=route(role);assert.equal((await h.GET(request(),params('7'))).status,200);assert.equal(h.queries[0].args[0],'7');}
});

test('invalid payout identities and missing attachments return not found',async()=>{
 for(const id of ['0','-1','1 OR 1=1','9007199254740992','7/../8']){const h=route();assert.equal((await h.GET(request(),params(id))).status,404);assert.equal(h.queries.length,0);}
 const missing=route('ADMIN',null);assert.equal((await missing.GET(request(),params('7'))).status,404);assert.equal(missing.queries.length,1);
});

test('broker receipts support private inline viewing and explicit download without changing bytes',async()=>{
 for(const download of [false,true]){
  const h=route(),response=await h.GET(request(download),params('7'));
  assert.equal(response.headers.get('Content-Type'),'application/pdf');
  assert.equal(response.headers.get('Content-Disposition'),`${download?'attachment':'inline'}; filename*=UTF-8''bank%20slip.pdf`);
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');assert.match(response.headers.get('Content-Security-Policy'),/sandbox/);
  assert.equal(await response.text(),'%PDF-1.7\n');
 }
});
