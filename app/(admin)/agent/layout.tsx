import {requireAgent} from '@/lib/agent-portal';
import '../sales-team/sales-department.css';
export default async function AgentLayout({children}:{children:React.ReactNode}){await requireAgent();return <div className="sales-department">{children}</div>;}
