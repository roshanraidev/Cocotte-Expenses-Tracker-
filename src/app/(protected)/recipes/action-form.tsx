'use client';
import { useActionState, useRef, type ReactNode } from 'react';
export default function RecipeActionForm({ action, children, className, multipart = false }: {
  action: (state: {error: string}, form: FormData) => Promise<{error: string}>;
  children: ReactNode; className?: string; multipart?: boolean;
}) {
  const preserveFields = useRef(false);
  const [state, submit, pending] = useActionState(async (previous: {error: string}, data: FormData) => {
    preserveFields.current = false;
    const result = await action(previous, data);
    preserveFields.current = Boolean(result.error);
    return result;
  }, { error: '' });
  return <form onReset={event => {
    // React resets uncontrolled fields after a resolved Action. Keep edits and uploaded files on validation errors.
    if (preserveFields.current) event.preventDefault();
  }} action={submit} className={className} encType={multipart ? 'multipart/form-data' : undefined}>
    <fieldset disabled={pending} className="contents">{children}</fieldset>
    {state.error && <p role="alert" className="notice">{state.error}</p>}
    {pending && <p role="status" className="page-description">Saving…</p>}
  </form>;
}
