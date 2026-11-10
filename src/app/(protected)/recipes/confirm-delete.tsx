'use client';
export default function ConfirmDelete({ message, className, label = 'Delete' }: { message: string; className?: string; label?: string }) {
  return <button type="submit" className={className} onClick={event => {
    if (!window.confirm(message)) event.preventDefault();
  }}>{label}</button>;
}
