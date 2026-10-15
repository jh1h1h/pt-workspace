import { useEffect, useState } from 'react';
import { QuickCapture } from './Tools';

export function GlobalQuickCapture() {
  const [open, setOpen] = useState(false);
  const eid = window.location.pathname.match(/^\/e\/([^/]+)/)?.[1] ?? '';
  const related = window.location.pathname.match(/\/pages\/([^/]+)/)?.[1];
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  if (!eid) return null;
  return open ? <QuickCapture eid={eid} related={related} onClose={() => setOpen(false)} /> : null;
}
