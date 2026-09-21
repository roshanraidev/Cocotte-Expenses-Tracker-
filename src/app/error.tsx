'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-xl px-6 py-24"><section className="card"><h1 className="text-2xl font-semibold">We couldn’t complete that request</h1><p className="my-4 text-stone-600">Please try again. If this is a new installation, check that PostgreSQL is running and the database migrations have been applied.</p><button className="btn" onClick={reset}>Try again</button></section></main>;
}
