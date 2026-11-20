import './entrance.css';
import { LoginForm } from '@/components/login-form';
import {permittedHome} from '@/lib/navigation';
import { currentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
export default async function LoginPage() {
  const user=await currentUser();
  // Next re-renders this route after the sign-in action sets its session cookie.
  // Keep the scene mounted for that response; the action result alone unlocks it.
  // This presentation-only header check grants no authentication or route access.
  const actionResponse=(await headers()).has('next-action');
  if(user&&!actionResponse)redirect(permittedHome(user));
  return <LoginForm/>;
}
