import {redirect} from 'next/navigation';
import {currentUser} from '@/lib/auth';
import {permittedHome} from '@/lib/navigation';
export default async function Home(){const user=await currentUser();redirect(user?permittedHome(user):'/login');}
