import {requirePermission} from '@/lib/auth';
import {NotificationCentre} from '@/components/kitchen/centre';
export default async function Notifications(){const user=await requirePermission('recipes.view');return <NotificationCentre admin={user.role==='SUPER_USER'}/>;}
