'use client';
import Link from 'next/link';
import {Bell} from 'lucide-react';
import {useKitchen} from './realtime';
export function NotificationBell(){const {unread}=useKitchen();return <Link className="kitchen-bell" href="/notifications" aria-label={`Notifications${unread?`, ${unread} unread`:''}`}><Bell size={20}/>{unread>0&&<span>{unread>99?'99+':unread}</span>}</Link>;}
