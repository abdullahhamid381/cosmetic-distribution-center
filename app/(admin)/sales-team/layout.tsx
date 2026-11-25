import {requireRole} from '@/lib/auth';
import {SalesDepartmentNav} from '@/components/SalesDepartmentNav';
import './sales-department.css';
export default async function SalesDepartmentLayout({children}:{children:React.ReactNode}){
 await requireRole('ADMIN','MANAGER','ACCOUNTS');
 return <div className="sales-department"><SalesDepartmentNav/>{children}</div>;
}
