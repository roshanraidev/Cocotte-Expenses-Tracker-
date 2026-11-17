'use client';
import {CircleAlert,RefreshCw} from 'lucide-react';
import s from './management.module.css';
export function ManagementLoading(){return <div className={s.surface} aria-busy="true" aria-label="Loading workspace"><div className={s.loadingTitle}/><div className={s.metrics}>{[0,1,2,3].map(i=><div className={s.loadingCard} key={i}/>)}</div><div className={s.loadingPanel}/><p className="sr-only" role="status">Loading your restaurant workspace…</p></div>;}
export function ManagementError({retry}:{retry:()=>void}){return <div className={s.surface}><section className={s.panel}><div className={s.empty} role="alert"><CircleAlert size={32}/><h1 className="text-xl">This workspace couldn’t load</h1><p>Please try again. Your existing records are preserved.</p><button className={s.primary} onClick={retry}><RefreshCw size={16}/>Try again</button></div></section></div>;}
