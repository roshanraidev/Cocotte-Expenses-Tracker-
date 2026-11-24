'use client';
import Link from 'next/link';
import {Sparkles} from 'lucide-react';
import {usePathname} from 'next/navigation';
import {useKitchen} from './realtime';
export function NavigationSpecials(){
 const {specials}=useKitchen(),path=usePathname();if(!specials.length)return null;
 return <section className="navigation-specials" aria-label="Weekly Specials"><div className="nav-item" title={`Weekly Specials · ${specials.length}`}><Sparkles size={18}/><span className="nav-label">Weekly Specials <small>{specials.length}</small></span><span className="rail-tooltip">Weekly Specials · {specials.length}</span></div><ul>{specials.map(s=><li key={s.id}><Link href={'/recipes/'+s.recipeId} title={s.name} aria-current={path==='/recipes/'+s.recipeId?'page':undefined}><span className="nav-label">{s.name}</span><span className="special-dot" aria-hidden="true">•</span><span className="rail-tooltip">{s.name}</span></Link></li>)}</ul></section>;
}
