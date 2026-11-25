const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,imports={}){
 const out={};
 const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('exports','require',source)(out,name=>imports[name]??require(name));
 return out;
}
const out=load('lib/invoice-filters.ts',{'./invoice-dates':load('lib/invoice-dates.ts')});
const {invoiceFilterQuery}=out;
test('week filters use Monday inclusive and the following Monday exclusive',()=>{
 const r=invoiceFilterQuery({week:'2026-W43'});assert.equal(r.error,'');assert.deepEqual(r.params,['2026-10-19']);assert.match(r.sql,/INTERVAL '7 days'/);
});
test('ISO weeks cross calendar years and reject nonexistent week 53',()=>{
 assert.deepEqual(invoiceFilterQuery({week:'2026-W01'}).params,['2025-12-29']);
 assert.deepEqual(invoiceFilterQuery({week:'2020-W53'}).params,['2020-12-28']);
 for(const week of ['2021-W53','2026-W00','2026-W54','bad'])assert.ok(invoiceFilterQuery({week}).error);
});
test('store, month, week and inclusive custom dates combine with bound search values',()=>{
 const r=invoiceFilterQuery({shop:'2',month:'2026-10',week:'2026-W43',from:'2026-10-20',to:'2026-10-23',q:"Shop's name"});
 assert.equal(r.error,'');assert.deepEqual(r.params,['2026-10-01','2026-10-19','2','2026-10-20','2026-10-23',"Shop's name"]);
 assert.match(r.sql,/i.issue_date <= \$5::date/);assert.ok(!r.sql.includes("Shop's name"));
 assert.ok(invoiceFilterQuery({from:'2026-10-24',to:'2026-10-20'}).error);
});
