import type { Page } from '../api/types';
export function page(values: Partial<Page> = {}): Page {
  return {
    id: 'page-1',
    engagement_id: 'e1',
    display_id: 'PAGE-0001',
    title: 'Note',
    icon: null,
    parent_id: null,
    page_type: 'note',
    journal_date: null,
    content: {
      type: 'doc',
      content: [{
        type: 'paragraph'
      }]
    },
    favorite: false,
    revision: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    deleted_at: null,
    task: null,
    ...values
  };
}
export function task(id: string, priority: 'P1' | 'P2' | 'P3', position = 0, status: 'Open' | 'In Progress' | 'Done' = 'Open'): Page {
  return page({
    id,
    title: id,
    page_type: 'task',
    display_id: `TASK-${id}`,
    task: {
      priority,
      position,
      status,
      due_date: null,
      related_page_id: null,
      parent_task_id: null
    }
  });
}
