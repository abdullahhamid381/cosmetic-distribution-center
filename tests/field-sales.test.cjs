const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const ts=require('typescript');

function load(file, imports={}) {
  const out={};
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,
  }}).outputText;
  new Function('require','exports',code)(name=>Object.hasOwn(imports,name)?imports[name]:
    name==='server-only'||name.startsWith('@/')?{}:require(name),out);
  return out;
}

const field=load('lib/field-sales.ts');
const utils=load('lib/utils.ts');
const formWith=values=>{
  const form=new FormData();
  for(const [name,value] of Object.entries(values))form.set(name,value);
  return form;
};
const seller={id:7,role:'SALES'};

test('field writes lock only the sales agent’s assigned active shop',async()=>{
  const params=[];
  const tx={query:async(sql,args)=>{
    assert.match(sql,/active.*assigned_sales_id=\$2\).*FOR UPDATE/s);
    params.push(args);
    return {rows:args[1]===null?[{id:10}]:[]};
  }};
  await assert.rejects(field.lockFieldShop(tx,10,seller),/assigned to you/);
  assert.equal((await field.lockFieldShop(tx,10,{id:2,role:'MANAGER'})).id,10);
  assert.deepEqual(params,[[10,7],[10,null]]);
});

test('field audit attributes the authenticated seller and only stores valid optional coordinates',async()=>{
  const entries=[];
  const tx={query:async(sql,args)=>{assert.match(sql,/INSERT INTO public.audit_logs/);entries.push(args);}};
  await field.recordFieldAudit(tx,seller,'FIELD_BOOK_STOCK','field_booking',14,10,new FormData());
  assert.equal(entries[0][0],7);
  assert.equal(Object.hasOwn(JSON.parse(entries[0][4]),'location'),false);
  await field.recordFieldAudit(tx,seller,'FIELD_BOOK_STOCK','field_booking',14,10,formWith({
    latitude:'31.5',longitude:'71.08',accuracy:'8',
  }));
  assert.deepEqual(JSON.parse(entries[1][4]).location,{latitude:31.5,longitude:71.08,accuracy:8});
  await assert.rejects(field.recordFieldAudit(tx,seller,'FIELD_BOOK_STOCK','field_booking',14,10,
    formWith({latitude:'91',longitude:'71.08',accuracy:'8'})),/Location is invalid/);
  assert.equal(entries.length,2);
});

test('retrying a field payment returns the saved collection without allocating money twice',async()=>{
  const statements=[];
  const tx={query:async(sql,args)=>{
    statements.push(sql);
    if(sql.includes('FROM shops'))return {rows:[{id:10}]};
    if(sql.includes('field_submission_id')){
      assert.deepEqual(args,['88a7d338-007e-4827-a959-b5bc41366340',10,7]);
      return {rows:[{id:'23'}]};
    }
    throw Error('Retried payment wrote to the database.');
  }};
  let location;
  const actions=load('app/actions.ts',{
    'next/navigation':{redirect:url=>{location=url;}},
    'next/cache':{revalidatePath:()=>{}},
    '@/lib/auth':{requireRole:async(...roles)=>{assert.ok(roles.includes('SALES'));return seller;}},
    '@/lib/db':{transaction:async fn=>fn(tx)},
    '@/lib/field-sales':field,
    '@/lib/utils':utils,
    '@/lib/sales-team':{validDate:value=>value},
    '@/lib/closing-period':{pakistanToday:()=> '2026-11-25'},
    '@/lib/payment-receipts':{readPaymentReceipt:async()=>null},
    '@/lib/product-pricing':{effectiveShopDiscount:()=>0},
  });
  await actions.recordFieldPayment(formWith({
    shop_id:'10',invoice_id:'99',amount:'250',method:'CASH',payment_date:'2026-11-25',
    submission_id:'88a7d338-007e-4827-a959-b5bc41366340',
  }));
  assert.equal(statements.length,2);
  assert.equal(location,'/field?shop=10&received=23');
});

test('combined collection allocates oldest due first and snapshots every open invoice',async()=>{
  const due=[
    {id:'1',invoice_no:'INV-1',due_date:'2026-11-10',total:'500',paid_total:'200',credit_total:'50'},
    {id:'2',invoice_no:'INV-2',due_date:'2026-11-20',total:'400',paid_total:'0',credit_total:'0'},
    {id:'3',invoice_no:'INV-3',due_date:'2026-12-10',total:'120',paid_total:'0',credit_total:'0'},
  ];
  const allocations=[];
  let audit;
  const tx={query:async(sql,args)=>{
    if(sql.includes('FROM shops'))return {rows:[{id:10}]};
    if(sql.includes('FROM payments'))return {rows:[]};
    if(sql.includes('FROM invoices')){
      assert.match(sql,/ORDER BY due_date,id FOR UPDATE/);
      assert.deepEqual(args,[10]);
      return {rows:due};
    }
    if(sql.includes('INSERT INTO payments'))return {rows:[{id:'24'}]};
    if(sql.includes('INSERT INTO payment_allocations'))allocations.push(args);
    if(sql.includes('INSERT INTO public.audit_logs'))audit=JSON.parse(args[4]);
    return {rows:[]};
  }};
  const actions=load('app/actions.ts',{
    'next/navigation':{redirect:()=>{}},
    'next/cache':{revalidatePath:()=>{}},
    '@/lib/auth':{requireRole:async()=>seller},
    '@/lib/db':{transaction:async fn=>fn(tx)},
    '@/lib/field-sales':field,
    '@/lib/utils':utils,
    '@/lib/sales-team':{validDate:value=>value},
    '@/lib/closing-period':{pakistanToday:()=> '2026-11-25'},
    '@/lib/payment-receipts':{readPaymentReceipt:async()=>null},
    '@/lib/product-pricing':{effectiveShopDiscount:()=>0},
  });
  await actions.recordFieldPayment(formWith({
    shop_id:'10',invoice_id:'all',amount:'300',method:'CASH',payment_date:'2026-11-25',
    submission_id:'858c8e6c-6c2a-4a7e-a8bf-22567ddab138',
  }));
  assert.deepEqual(allocations,[[24,'1','250.00'],[24,'2','50.00']]);
  assert.equal(audit.balanceAfterCents,47000);
  assert.deepEqual(audit.combinedInvoices.map(line=>[line.number,line.balanceBeforeCents,line.appliedCents,line.balanceAfterCents]),[
    ['INV-1',25000,25000,0],['INV-2',40000,5000,35000],['INV-3',12000,0,12000],
  ]);
});

test('combined receipt uses the recorded snapshot, including invoices with no allocation',async()=>{
  const rows=[
    {number:'INV-1',dueDate:'2026-11-10',balanceBeforeCents:25000,appliedCents:25000,balanceAfterCents:0},
    {number:'INV-2',dueDate:'2026-11-20',balanceBeforeCents:40000,appliedCents:0,balanceAfterCents:40000},
  ];
  let document;
  const {GET}=load('app/api/field/pdf/[kind]/[id]/route.ts',{
    '@/lib/auth':{currentUser:async()=>seller},
    '@/lib/field-sales':field,
    '@/lib/utils':utils,
    '@/lib/closing-period':{pakistanToday:()=> '2026-11-25'},
    '@/lib/invoice-dates':load('lib/invoice-dates.ts'),
    '@/lib/invoice-barcode':load('lib/invoice-barcode.ts'),
    '@/lib/db':{transaction:async fn=>fn({query:async(sql,args)=>{
      if(sql.startsWith('SET TRANSACTION'))return {};
      if(sql.includes('FROM invoices i LEFT JOIN deliveries')){
        assert.equal(args[0],'10');
        assert.deepEqual(args[2],['INV-1','INV-2']);
        return {rows:[{id:1,invoice_no:'INV-1',issue_date:'2026-11-10',due_date:'2026-11-10',
          slip_number:'1',subtotal:'500',discount_total:'250',total:'250',paid_total:'250',credit_total:'0',balance:'0',
          lines:[{name:'Serum',batch:'B10',qty:2,mrp:250,first:50,second:0,price:125,total:250}]}]};
      }
      assert.match(sql,/assigned_sales_id=\$2 AND p.created_by=\$2/);
      assert.deepEqual(args,['24',7]);
      return {rows:[{payment_no:'PAY-000024',amount:'250',method:'CASH',shop_name:'Example shop',store_code:'EXS-10',
        date:'25 Nov 2026',shop_id:'10',created_at:new Date('2026-11-25T08:00:00Z'),combined_invoices:rows}]};
    }})},
    '@/lib/report-pdf':{reportPdf:async model=>{document=model;return new Uint8Array([37,80,68,70]);}},
  });
  const response=await GET(new Request('http://localhost/api/field/pdf/receipt/24'),
    {params:Promise.resolve({kind:'receipt',id:'24'})});
  assert.equal(response.status,200);
  assert.equal(document.title,'Combined invoice statement and receipt');
  assert.deepEqual(document.tables[0].rows[1],['INV-2','2026-11-20','Rs. 400.00','Rs. 0.00','Rs. 400.00']);
  assert.equal(document.tables[1].barcode.value,'INV-20261110-1');
  assert.deepEqual(document.tables[1].rows[0],['Serum\nBatch: B10','2','250.00','50.00%','0.00%','125.00','250.00']);
  assert.deepEqual(document.tables[1].invoiceTotals,{
    subtotal:'Rs. 500.00',discount:'Rs. 250.00',total:'Rs. 250.00',
    paid:'Rs. 250.00',credits:'Rs. 0.00',balance:'Rs. 0.00',
  });
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(response.headers.get('content-disposition'),'attachment; filename="EXS-10-2026-11-25.pdf"');
});

test('Field Sales staff are restricted to their assigned shops and cannot grant access',async()=>{
  const user={id:9,role:'FIELD_SALES'};
  assert.equal(field.fieldOwner(user),9);
  const form=formWith({shop_id:'10',assigned_sales_id:'9'});
  const actions=load('app/field-sales-actions.ts',{
    './actions':{},
    'next/navigation':{},
    'next/cache':{},
    '@/lib/auth':{requireRole:async(...roles)=>{assert.deepEqual(roles,['ADMIN','MANAGER']);throw Error('Forbidden');}},
    '@/lib/db':{transaction:async()=>{throw Error('An unauthorized change attempted to write');}},
    '@/lib/field-sales':field,
    '@/lib/utils':utils,
  });
  await assert.rejects(actions.assignFieldShop({},form),/Forbidden/);
});

test('shops registered by Field Sales staff wait for manager assignment',async()=>{
  const user={id:9,role:'FIELD_SALES'};
  const writes=[];
  const actions=load('app/field-sales-actions.ts',{
    './actions':{},
    'next/navigation':{unstable_rethrow:()=>{}},
    'next/cache':{revalidatePath:()=>{}},
    '@/lib/auth':{requireRole:async(...roles)=>{assert.ok(roles.includes('FIELD_SALES'));return user;}},
    '@/lib/db':{transaction:async fn=>fn({query:async(sql,args)=>{
      writes.push({sql,args});
      return {rows:[{id:'25'}]};
    }})},
    '@/lib/field-sales':field,
    '@/lib/utils':utils,
  });
  const result=await actions.saveFieldShop({},formWith({shop_name:'Example Shop',assigned_sales_id:'9'}));
  assert.match(result.success,/grant shop access/);
  assert.match(writes[0].sql,/INSERT INTO shops/);
  assert.equal(writes[0].args.at(-1),null);
  assert.equal(JSON.parse(writes[1].args[4]).changes.assigned_sales_id,null);
});

test('single invoice receipt shows who received payment and preserves the balance at collection',async()=>{
  let document;
  const {GET}=load('app/api/field/pdf/[kind]/[id]/route.ts',{
    '@/lib/auth':{currentUser:async()=>seller},
    '@/lib/field-sales':field,
    '@/lib/utils':utils,
    '@/lib/closing-period':{pakistanToday:()=> '2026-11-25'},
    '@/lib/db':{transaction:async fn=>fn({query:async sql=>{
      if(sql.startsWith('SET TRANSACTION'))return {};
      if(sql.includes('FROM payment_allocations'))return {rows:[{id:'1',invoice_no:'INV-1',amount:'250',balance:'0'}]};
      if(sql.includes('FROM invoices i LEFT JOIN deliveries'))return {rows:[]};
      return {rows:[{payment_no:'PAY-000024',amount:'250',method:'CASH',shop_name:'Example shop',
        store_code:'EXS-10',collector:'Example Collector',date:'25 Nov 2026',shop_id:'10',balance_after_cents:15000}]};
    }})},
    '@/lib/report-pdf':{reportPdf:async model=>{document=model;return new Uint8Array([37,80,68,70]);}},
  });
  const response=await GET(new Request('http://localhost/api/field/pdf/receipt/24'),
    {params:Promise.resolve({kind:'receipt',id:'24'})});
  assert.equal(response.status,200);
  assert.deepEqual(document.metrics,[
    {label:'Payment received',value:'Rs. 250.00'},
    {label:'Received by',value:'Example Collector'},
    {label:'Balance after this payment',value:'Rs. 150.00'},
  ]);
});

test('field handover submits only the collector’s own receipts and separates cash without posting payments',async()=>{
  const statements=[];
  const tx={query:async(sql,args)=>{
    statements.push(sql);
    if(sql.includes('FOR UPDATE OF p')){
      assert.deepEqual(args,[[1,2],7]);
      return {rows:[{id:'1',amount:'100.20',method:'CASH'},{id:'2',amount:'250.40',method:'BANK'}]};
    }
    if(sql.includes('SELECT 1 FROM field_payment_handover_items'))return {rowCount:0};
    if(sql.includes('INSERT INTO field_payment_handovers')){
      assert.deepEqual(args,[7,'350.60','100.20','Cash and bank slip']);
      return {rows:[{id:'31'}]};
    }
    if(sql.includes('INSERT INTO field_payment_handover_items'))assert.deepEqual(args,['31',[1,2]]);
    return {rows:[]};
  }};
  const actions=load('app/field-handover-actions.ts',{
    'next/navigation':{unstable_rethrow:()=>{}},'next/cache':{revalidatePath:()=>{}},
    '@/lib/auth':{requireRole:async(...roles)=>{assert.ok(roles.includes('FIELD_SALES'));return seller;}},
    '@/lib/db':{transaction:async fn=>fn(tx)},'@/lib/field-sales':field,'@/lib/utils':utils,
  });
  const form=formWith({payment_id:'1',note:'Cash and bank slip'});
  form.append('payment_id','2');
  assert.match((await actions.submitFieldHandover({},form)).success,/submitted/);
  assert.equal(statements.some(sql=>/INSERT INTO payments|UPDATE invoices/i.test(sql)),false);
});

test('only admins review handovers and a rejection releases payments for resubmission',async()=>{
  const statements=[];
  const actions=load('app/field-handover-actions.ts',{
    'next/navigation':{unstable_rethrow:()=>{}},'next/cache':{revalidatePath:()=>{}},
    '@/lib/auth':{requireRole:async(...roles)=>{assert.deepEqual(roles,['ADMIN']);return {id:2,role:'ADMIN'};}},
    '@/lib/db':{transaction:async fn=>fn({query:async(sql,args)=>{
      statements.push(sql);
      if(sql.includes('UPDATE field_payment_handovers')){
        assert.match(sql,/status='SUBMITTED' AND submitted_by<>\$3/);
        assert.deepEqual(args,[31,'REJECTED',2,'Cash amount does not match']);
        return {rows:[{submitted_by:'7',amount:'350.60'}]};
      }
      return {rows:[]};
    }})},
    '@/lib/field-sales':field,'@/lib/utils':utils,
  });
  assert.match((await actions.reviewFieldHandover({},formWith({
    handover_id:'31',decision:'REJECTED',review_note:'Cash amount does not match',
  }))).success,/submit the payments again/);
  assert.ok(statements.some(sql=>sql.includes('SET released_at=now()')));
  assert.equal(statements.some(sql=>/INSERT INTO payments|UPDATE invoices/i.test(sql)),false);
});
