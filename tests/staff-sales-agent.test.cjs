const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const utils={};new Function('require','exports',compile('lib/utils.ts'))(require,utils);
function setup(fail=false,duplicate=false){
 const state={users:0,profiles:0,audits:0},actions={};
 const tx={query:async(sql,args)=>{
  if(sql.startsWith('INSERT INTO users')){assert.match(sql,/ON CONFLICT\(email\) DO NOTHING/);if(duplicate)return {rows:[]};state.users++;assert.equal(args[2],'hashed-password');return {rows:[{id:11}]};}
  if(sql.startsWith('SELECT id FROM users WHERE email='))return {rows:[{id:12}]};
  if(sql.startsWith('INSERT INTO sales_agents')){if(fail)throw new Error('profile failed');assert.deepEqual(args,[11]);state.profiles++;return {rows:[]};}
  if(sql.startsWith('INSERT INTO public.audit_logs')){state.audits++;return {rows:[]};}
  throw new Error('Unexpected query');
 }};
 new Function('require','exports',compile('app/actions.ts'))(n=>{
  if(n==='@/lib/utils')return utils;
  if(n==='bcryptjs')return {hash:async()=> 'hashed-password'};
  if(n==='@/lib/auth')return {requireRole:async(...roles)=>{assert.deepEqual(roles,['ADMIN']);return {id:1};}};
  if(n==='@/lib/db')return {transaction:async fn=>{const before={...state};try{return await fn(tx);}catch(e){Object.assign(state,before);throw e;}}};
  if(n==='next/cache')return {revalidatePath:()=>{}};
  if(n==='next/navigation')return {redirect:path=>{throw Object.assign(new Error('redirect'),{path});}};
  return n.startsWith('@/')?{}:require(n);
 },actions);return {actions,state};
}
function form(role){const f=new FormData();for(const [k,v] of Object.entries({full_name:'Agent',email:'agent@example.invalid',password:'long-test-password',role}))f.set(k,v);return f;}
test('Sales Agent keeps SALES role and staff creation enables its private portal atomically',async()=>{
 assert.equal(utils.roleLabel('SALES'),'Sales Agent');const {actions,state}=setup();await assert.rejects(actions.createUser(form('SALES')),e=>e.path==='/staff?created=1');assert.deepEqual(state,{users:1,profiles:1,audits:1});
});
test('other staff roles do not receive a sales agent profile',async()=>{
 const {actions,state}=setup();await assert.rejects(actions.createUser(form('ACCOUNTS')),e=>e.path==='/staff?created=1');assert.equal(state.profiles,0);
});
test('profile failure rolls back staff creation rather than leaving an agent without portal access',async()=>{
 const {actions,state}=setup(true);await assert.rejects(actions.createUser(form('SALES')),/profile failed/);assert.deepEqual(state,{users:0,profiles:0,audits:0});
});
test('duplicate email redirects to an actionable account notice without creating or changing records',async()=>{
 const {actions,state}=setup(false,true);await assert.rejects(actions.createUser(form('SALES')),e=>e.path==='/staff?error=email-exists&existing=12');assert.deepEqual(state,{users:0,profiles:0,audits:0});
});
