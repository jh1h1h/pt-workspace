import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TableKit } from '@tiptap/extension-table';
import { phase3Extensions } from './phase3Extensions';
export const extensions = (engagementId = '') => [StarterKit.configure({
  heading: {
    levels: [1, 2, 3]
  },
  link: {
    openOnClick: false,
    autolink: false,
    HTMLAttributes: {
      rel: 'noopener noreferrer'
    }
  }
}), TaskList, TaskItem.configure({
  nested: true
}), TableKit.configure({
  table: {
    resizable: true
  }
}), ...phase3Extensions(engagementId)];
