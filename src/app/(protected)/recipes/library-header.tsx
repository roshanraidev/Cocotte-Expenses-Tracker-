'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';

export default function LibraryHeader({ actions, searchable }: { actions: ReactNode; searchable: boolean }) {
  const marker = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    // A stable marker outside the resizing header avoids scroll/resize feedback loops.
    if (!marker.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      setCompact(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    }, { rootMargin: '64px 0px 0px 0px' });
    observer.observe(marker.current);
    return () => observer.disconnect();
  }, []);

  function focusFilters() {
    const search = document.querySelector<HTMLInputElement>('#recipe-library-filters input[name="q"]');
    search?.focus({ preventScroll: true });
    document.getElementById('recipe-library-filters')?.scrollIntoView({
      block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }

  return <>
    <div ref={marker} className="recipe-header-marker" aria-hidden="true" />
    <header className={'recipe-library-heading recipe-mobile-heading' + (compact ? ' is-compact' : '') + (!actions ? ' is-viewer' : '')}>
      <div className="recipe-heading-identity">
        <h1 className="page-title">Recipe Library</h1>
        <p className="recipe-library-intro">Recipes, components &amp; preparations</p>
      </div>
      <div className="recipe-heading-actions">
        {actions}
        {searchable && <button type="button" className="btn btn-secondary recipe-filter-shortcut"
          aria-label="Search and filter recipes" aria-controls="recipe-library-filters" onClick={focusFilters}>
          <Search size={17} aria-hidden="true" />
        </button>}
      </div>
    </header>
  </>;
}
