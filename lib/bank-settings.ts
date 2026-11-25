import 'server-only';
import {query} from './db';
import type {BankDetails} from './bank-types';
export async function bankSettings():Promise<BankDetails> {
 const [row]=await query('SELECT details FROM bank_settings WHERE id=1');
 const data=row?.details||{};
 return {bankName:String(data.bankName||''),accountTitle:String(data.accountTitle||''),accountNumber:String(data.accountNumber||''),iban:String(data.iban||''),branchCode:String(data.branchCode||''),qrDataUrl:String(data.qrDataUrl||'')};
}
