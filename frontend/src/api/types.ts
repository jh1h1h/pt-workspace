import type { RecordKind, RecordProperties, RecordChanges } from './recordTypes';
import type { JSONContent } from '@tiptap/react';
export type Document = JSONContent;
export type Status = 'Open' | 'In Progress' | 'Done';
export type Priority = 'P1' | 'P2' | 'P3';
export interface Engagement {
  id: string;
  name: string;
  created_at: string;
  deleted_at: string | null;
}
export interface Task {
  status: Status;
  priority: Priority;
  due_date: string | null;
  position: number;
  related_page_id: string | null;
  parent_task_id: string | null;
}
export interface Page {
  id: string;
  engagement_id: string;
  display_id: string;
  title: string;
  icon: string | null;
  parent_id: string | null;
  page_type: 'note' | 'journal' | 'task' | 'scratchpad' | RecordKind;
  journal_date: string | null;
  content: Document;
  favorite: boolean;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  task: Task | null;
  record?: RecordProperties | null;
}
export interface Listing<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}
export type PageChanges = Partial<Pick<Page, 'title' | 'content' | 'icon' | 'parent_id' | 'favorite'>> & Partial<Omit<Task, 'status' | 'priority' | 'due_date'>> & RecordChanges;
