import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Page } from "../api/types";
import { useRefresh } from "../api/queries";
import { Button } from "./ui/button";
import { ErrorMessage } from "./Feedback";

export function CreatePageDialog({
  eid,
  parentId,
  onClose,
  onCreated,
}: {
  eid: string;
  parentId?: string;
  onClose: () => void;
  onCreated?: (page: Page) => void;
}) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const refresh = useRefresh(eid);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const page = await api.createPage(eid, {
        title: title.trim(),
        parent_id: parentId ?? null,
      });
      await refresh();
      onCreated?.(page);
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={parentId ? "Create child page" : "Create page"}
      >
        <h2>{parentId ? "Create child page" : "Create page"}</h2>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Page title
            <input
              autoFocus
              aria-label="Page title"
              maxLength={300}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          {error ? <ErrorMessage error={error} /> : null}
          <div className="dialog-actions">
            <Button disabled={busy}>Create page</Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}