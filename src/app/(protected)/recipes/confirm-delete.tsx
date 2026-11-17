'use client';
export default function ConfirmDelete({ message, className, label = 'Delete',disabled=false }: { message: string; className?: string; label?: string;disabled?:boolean }) {
  return <button type="submit" disabled={disabled} className={className} onClick={event => {
    if (!window.confirm(message)) event.preventDefault();
  }}>{label}</button>;
}
