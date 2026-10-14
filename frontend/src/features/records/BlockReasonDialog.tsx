import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/button';
export function BlockReasonDialog({
  onSubmit,
  onClose
}: {
  onSubmit: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  return <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Block backlog item"><h2>Why is this work blocked?</h2><form onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit(reason.trim());
      }}><label>Blocker reason<textarea aria-label="Blocker reason" autoFocus required value={reason} onChange={e => setReason(e.target.value)} maxLength={20000} /></label><Button disabled={!reason.trim()}>Mark blocked</Button><Button variant="outline" type="button" onClick={onClose}>Cancel</Button></form></div></div>;
}
