'use client';
import { useState } from 'react';
type Choice = { id: string; name: string; typeName: string };
export default function ComponentSelector({ choices, initialIds }: { choices: Choice[]; initialIds: string[] }) {
  const [ids, setIds] = useState(initialIds), [query, setQuery] = useState(''), [selected, setSelected] = useState('');
  const matches = choices.filter(r => !ids.includes(r.id) && `${r.name} ${r.typeName}`.toLowerCase().includes(query.toLowerCase()));
  function move(index: number, direction: number) {
    const next = [...ids];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setIds(next);
  }
  return <section>
    <h2 className="section-title">Components & Preparations</h2>
    <p className="page-description">Link reusable sauces, sides and preparations. Their recipes remain separate and stay up to date.</p>
    <input type="hidden" name="componentsIncluded" value="true" />
    {ids.map((id, index) => <div key={id} className="flex flex-wrap items-center gap-2 mb-2">
      <input type="hidden" name="componentIds" value={id} />
      <span className="flex-1 text-sm">{choices.find(r => r.id === id)?.name ?? 'Unavailable recipe'}</span>
      <button type="button" className="btn btn-secondary" disabled={index === 0} aria-label={`Move component ${index + 1} up`} onClick={() => move(index, -1)}>↑</button>
      <button type="button" className="btn btn-secondary" disabled={index === ids.length - 1} aria-label={`Move component ${index + 1} down`} onClick={() => move(index, 1)}>↓</button>
      <button type="button" className="btn btn-secondary" onClick={() => setIds(ids.filter(value => value !== id))}>Remove Component</button>
    </div>)}
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
      <label>Search component recipes<input type="search" value={query} onChange={event => { setQuery(event.target.value); setSelected(''); }} placeholder="Search recipes…" /></label>
      <label>Add Component Recipe<select value={selected} onChange={event => setSelected(event.target.value)}><option value="">Select a recipe</option>{matches.map(r => <option key={r.id} value={r.id}>{r.name} · {r.typeName}</option>)}</select></label>
      <button type="button" className="btn btn-secondary" disabled={!selected} onClick={() => { setIds([...ids, selected]); setSelected(''); }}>Add Component</button>
    </div>
    {!matches.length && <p className="page-description">No other recipes match this search.</p>}
  </section>;
}
