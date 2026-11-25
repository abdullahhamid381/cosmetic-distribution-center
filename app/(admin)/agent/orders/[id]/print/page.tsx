import {requireAgent} from '@/lib/agent-portal';
import CustomerInvoice from '@/app/(admin)/sales-team/[id]/print/page';
export default async function MyCustomerInvoice(props:{params:Promise<{id:string}>}){await requireAgent();return CustomerInvoice(props);}
