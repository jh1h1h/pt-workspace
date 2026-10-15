import type { Editor } from '@tiptap/react';
export const blockCommands: {
  label: string;
  run: (editor: Editor) => void;
}[] = [{
  label: 'Paragraph',
  run: e => {
    e.chain().focus().setParagraph().run();
  }
}, {
  label: 'Heading 1',
  run: e => {
    e.chain().focus().toggleHeading({
      level: 1
    }).run();
  }
}, {
  label: 'Heading 2',
  run: e => {
    e.chain().focus().toggleHeading({
      level: 2
    }).run();
  }
}, {
  label: 'Heading 3',
  run: e => {
    e.chain().focus().toggleHeading({
      level: 3
    }).run();
  }
}, {
  label: 'Bullet list',
  run: e => {
    e.chain().focus().toggleBulletList().run();
  }
}, {
  label: 'Numbered list',
  run: e => {
    e.chain().focus().toggleOrderedList().run();
  }
}, {
  label: 'Checklist',
  run: e => {
    e.chain().focus().toggleTaskList().run();
  }
}, {
  label: 'Quote',
  run: e => {
    e.chain().focus().toggleBlockquote().run();
  }
}, {
  label: 'Code block',
  run: e => {
    e.chain().focus().toggleCodeBlock({
      language: 'plaintext'
    }).run();
  }
}, {
  label: 'Table',
  run: e => {
    e.chain().focus().insertTable({
      rows: 3,
      cols: 3,
      withHeaderRow: true
    }).run();
  }
}, {
  label: 'Divider',
  run: e => {
    e.chain().focus().setHorizontalRule().run();
  }
}, {
  label: 'Callout',
  run: e => {
    e.chain().focus().insertContent({ type: 'callout', attrs: { tone: 'info', icon: '💡' }, content: [{ type: 'paragraph' }] }).run();
  }
}];
