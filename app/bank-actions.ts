'use server';
import sharp from 'sharp';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireRole} from '@/lib/auth';
import {transaction} from '@/lib/db';
import {str} from '@/lib/utils';

export async function saveBankSettings(form:FormData) {
 const user=await requireRole('ADMIN');
 try {
  const details={bankName:str(form,'bankName'),accountTitle:str(form,'accountTitle'),accountNumber:str(form,'accountNumber'),iban:str(form,'iban').replace(/\s/g,'').toUpperCase(),branchCode:str(form,'branchCode')};
  if(Object.values(details).some(value=>value.length>200))throw new Error('Bank fields must be 200 characters or fewer.');
  let qrDataUrl:string|undefined;
  const qr=form.get('qr');
  if(qr&&typeof qr!=='string'&&qr.size) {
   if(qr.size>2*1024*1024)throw new Error('Bank QR image must be 2 MB or smaller.');
   try {
    const image=sharp(Buffer.from(await qr.arrayBuffer()),{limitInputPixels:16000000});
    const metadata=await image.metadata();
    if(!['png','jpeg','webp'].includes(metadata.format||''))throw new Error('Unsupported image');
    const png=await image.rotate().resize({width:800,height:800,fit:'inside',withoutEnlargement:true}).png().toBuffer();
    qrDataUrl='data:image/png;base64,'+png.toString('base64');
   } catch {throw new Error('Upload a valid PNG, JPG, or WebP bank QR image.');}
  }
  await transaction(async tx=>{
   // Create the singleton before locking so concurrent first saves serialize too.
   await tx.query("INSERT INTO bank_settings(id,details) VALUES(1,'{}') ON CONFLICT(id) DO NOTHING");
   const before=(await tx.query('SELECT details FROM bank_settings WHERE id=1 FOR UPDATE')).rows[0].details;
   const next={...details,qrDataUrl:qrDataUrl??(form.has('remove_qr')?'':before.qrDataUrl||'')};
   await tx.query('UPDATE bank_settings SET details=$1,updated_by=$2,updated_at=NOW() WHERE id=1',[JSON.stringify(next),user.id]);
   await tx.query("INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'UPDATE','bank_settings',1,$2)",[user.id,JSON.stringify({fields:details,qrChanged:qrDataUrl!==undefined||form.has('remove_qr')})]);
  });
 } catch(error) {
  const message=error instanceof Error&&!('code' in error)?error.message:'Unable to save bank details. Please try again.';
  redirect('/settings/bank?error='+encodeURIComponent(message));
 }
 revalidatePath('/','layout');redirect('/settings/bank?saved=1');
}
