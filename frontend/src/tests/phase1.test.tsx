import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Editor } from '@tiptap/react';
import { api } from '../api/client';
import { Home, priorityQueue } from '../features/Home';
import { Shell } from '../app/Shell';
import { RichEditor } from '../editor/RichEditor';
import { extensions } from '../editor/extensions';
import { blockCommands } from '../editor/commands';
import { page, task } from './fixtures';
import { saves } from '../hooks/saveCoordinator';
import { phase3Api } from '../api/phase3';
import type { Page, Task } from '../api/types';
let tasks: Page[];
function renderHome(shell = false) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      },
      mutations: {
        retry: false
      }
    }
  });
  const router = createMemoryRouter(shell ? [{
    path: '/e/:eid',
    element: <Shell />,
    children: [{
      path: 'home',
      element: <Home />
    }, {
      path: 'pages/:pid',
      element: <p>Opened note</p>
    }]
  }] : [{
    path: '/e/:eid/home',
    element: <Home />
  }, {
    path: '/e/:eid/pages/:pid',
    element: <p>Opened note</p>
  }], {
    initialEntries: ['/e/e1/home']
  });
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return {
    ...view,
    router,
    client
  };
}
beforeEach(() => {
  tasks = [task('high', 'P1'), task('medium', 'P2')];
  vi.spyOn(api, 'engagements').mockResolvedValue([{
    id: 'e1',
    name: 'First',
    created_at: '',
    deleted_at: null
  }, {
    id: 'e2',
    name: 'Second',
    created_at: '',
    deleted_at: null
  }]);
  vi.spyOn(api, 'pages').mockResolvedValue([]);
  vi.spyOn(api, 'tasks').mockImplementation(async eid => eid === 'e1' ? tasks : []);
  vi.spyOn(api, 'scratchpad').mockImplementation(async eid => page({
    id: `scratch-${eid}`,
    engagement_id: eid,
    page_type: 'scratchpad',
    title: 'Scratchpad'
  }));
  vi.spyOn(api, 'recent').mockResolvedValue([page()]);
  vi.spyOn(api, 'patch').mockImplementation(async (p, changes) => {
    const updated = {
      ...p,
      ...changes,
      revision: p.revision + 1
    };
    if (p.task) {
      updated.task = {...p.task,...changes} as Task;
      tasks = tasks.map(t => t.id === p.id ? updated : t);
    }
    return updated;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  saves.entries.clear();
  saves.notify();
});
describe('Phase 1 components', () => {
  it('P1-F01 dashboard has exactly the three fixed sections', async () => {
    renderHome();
    await screen.findByRole('textbox', {
      name: 'Scratchpad content'
    });
    expect(screen.getAllByRole('region').map(r => r.getAttribute('aria-labelledby'))).toEqual(['priority-heading', 'scratch-heading', 'recent-heading']);
  });
  it('P1-F02 dashboard has no KPIs or assessment statistics', async () => {
    renderHome();
    await screen.findByRole('textbox', {
      name: 'Scratchpad content'
    });
    expect(screen.queryByText(/coverage|findings count|tests completed|attack.surface totals|KPI/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
  it('Home keeps task creation compact and restores the quiet shared header', async () => {
    renderHome(true);
    expect(await screen.findByText('A quiet place to pick up where you left off.')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toHaveTextContent('Home');
    expect(screen.queryByRole('textbox', { name: 'New personal task' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(screen.getByRole('dialog', { name: 'Add personal task' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'New personal task' })).toBeInTheDocument();
  });
  it('keeps Test Cases out of sidebar pages and pins', async () => {
    vi.mocked(api.pages).mockResolvedValue([
      page({ id: 'general', title: 'General page', page_type: 'page' }),
      page({ id: 'test-case', title: 'SSO procedure', page_type: 'test_case', favorite: true, record: { kind: 'test_case', category: 'Authentication', priority: 'P2', execution_status: 'Not Started', assessment_outcome: 'Not Assessed', testing_notes: '' } })
    ]);
    renderHome(true);
    const sidebar = screen.getByLabelText('Workspace navigation');
    expect(await within(sidebar).findByRole('link', { name: /General page/ })).toBeInTheDocument();
    expect(within(sidebar).queryByText(/SSO procedure/)).not.toBeInTheDocument();
    expect(within(sidebar).getByRole('link', { name: 'Test Cases' })).toBeInTheDocument();
  });
  it('sidebar page creation uses a modal and creates a visible page', async () => {
    const created = page({ id: 'new-page', title: 'Childless page', page_type: 'page' });
    vi.spyOn(api, 'createPage').mockResolvedValue(created);
    renderHome(true);
    await userEvent.click(await screen.findByRole('button', { name: 'New page' }));
    const dialog = screen.getByRole('dialog', { name: 'Create page' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Page title' }), 'Childless page');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create page' }));
    await waitFor(() => expect(api.createPage).toHaveBeenCalledWith('e1', { title: 'Childless page', parent_id: null }));
  });
  it('P1-F03 completed personal task disappears from Priority Queue', async () => {
    renderHome();
    await userEvent.click(await screen.findByRole('checkbox', {
      name: 'Complete high'
    }));
    await waitFor(() => expect(screen.queryByRole('checkbox', {
      name: 'Complete high'
    })).not.toBeInTheDocument());
    expect(tasks.find(t => t.id === 'high')?.task?.status).toBe('Done');
  });
  it('P1-F04 priority and manual position ordering', async () => {
    tasks = [task('low', 'P3'), task('second', 'P1', 2), task('first', 'P1', 1), task('middle', 'P2'), task('done', 'P1', 0, 'Done')];
    renderHome();
    await screen.findByRole('checkbox', {
      name: 'Complete first'
    });
    expect(screen.getAllByRole('checkbox').map(e => e.getAttribute('aria-label'))).toEqual(['Complete first', 'Complete second', 'Complete middle', 'Complete low']);
    expect(priorityQueue(tasks).map(t => t.id)).toEqual(['first', 'second', 'middle', 'low']);
  });
  it('P1-F05 scratchpad autosaves and displays save status', async () => {
    renderHome();
    const editor = await screen.findByRole('textbox', {
      name: 'Scratchpad content'
    });
    fireEvent.input(editor, {
      target: {
        innerHTML: '<p>Observation</p>'
      }
    });
    await waitFor(() => expect(api.patch).toHaveBeenCalled(), {
      timeout: 3000
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    expect(api.patch).toHaveBeenCalledWith(expect.objectContaining({
      page_type: 'scratchpad'
    }), expect.objectContaining({
      content: expect.objectContaining({
        type: 'doc'
      })
    }));
  });
  it('P1-F06 editor schema supports all required Phase 1 blocks and marks', () => {
    const editor = new Editor({
      extensions: extensions(),
      content: page().content
    });
    for (const node of ['doc', 'paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'taskItem', 'blockquote', 'codeBlock', 'horizontalRule', 'table', 'tableRow', 'tableCell', 'tableHeader']) expect(editor.schema.nodes[node]).toBeDefined();
    for (const mark of ['bold', 'italic', 'underline', 'code']) expect(editor.schema.marks[mark]).toBeDefined();
    for (const command of blockCommands) {
      editor.commands.setContent(page().content);
      command.run(editor);
      expect(editor.getJSON()).toBeDefined();
    }
    editor.destroy();
  });
  it('P1-F07 slash menu inserts selected block', async () => {
    render(<RichEditor content={page().content} onChange={() => {}} />);
    const editor = screen.getByRole('textbox', {
      name: 'Document'
    });
    await userEvent.click(editor);
    editor.innerHTML = '<p>/heading</p>';
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    fireEvent.input(editor);
    const menu = await screen.findByRole('listbox', {
      name: 'Slash commands'
    });
    await userEvent.click(within(menu).getByRole('option', {
      name: 'Heading 2'
    }));
    expect(editor.querySelector('h2')).toBeInTheDocument();
    expect(editor.textContent).not.toContain('/heading');
  });
  it('slash menu opens child-page creation with the current page as parent', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><RichEditor content={page().content} onChange={() => {}} engagementId="e1" parentPageId="parent-1" /></QueryClientProvider>);
    const editor = screen.getByRole('textbox', { name: 'Document' });
    await userEvent.click(editor);
    editor.innerHTML = '<p>/create child</p>';
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    fireEvent.input(editor);
    const slashMenu = await screen.findByRole('listbox', { name: 'Slash commands' });
    await userEvent.click(within(slashMenu).getByRole('option', { name: 'Create child page' }));
    expect(screen.getByRole('dialog', { name: 'Create child page' })).toBeInTheDocument();
  });
  it('slash menu links an existing page without changing hierarchy', async () => {
    vi.spyOn(phase3Api, 'search').mockResolvedValue([{ id: 'target-1', display_id: 'PAGE-0002', title: 'Existing page', kind: 'page', excerpt: '' }]);
    const changes = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><RichEditor content={page().content} onChange={changes} engagementId="e1" parentPageId="parent-1" /></QueryClientProvider>);
    const editor = screen.getByRole('textbox', { name: 'Document' });
    await userEvent.click(editor);
    editor.innerHTML = '<p>/link page</p>';
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    fireEvent.input(editor);
    const slashMenu = await screen.findByRole('listbox', { name: 'Slash commands' });
    await userEvent.click(within(slashMenu).getByRole('option', { name: 'Link page' }));
    const dialog = await screen.findByRole('dialog', { name: 'Link existing page' });
    await waitFor(() => expect(phase3Api.search).toHaveBeenCalledWith('e1', '*'));
    await userEvent.click(await within(dialog).findByRole('button', { name: /Existing page/ }));
    await waitFor(() => expect(changes).toHaveBeenCalledWith(expect.objectContaining({ type: 'doc' })));
    expect(api.patch).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ parent_id: expect.anything() }));
  });
  it('P1-F08 recent links navigate to the correct page', async () => {
    const {
      router
    } = renderHome();
    const region = screen.getByRole('region', {
      name: 'Recently Opened'
    });
    await userEvent.click(await within(region).findByRole('link'));
    expect(router.state.location.pathname).toBe('/e/e1/pages/page-1');
    await screen.findByText('Opened note');
  });
  it('P1-F09 engagement switching changes task and scratchpad data', async () => {
    renderHome(true);
    await screen.findByRole('checkbox', {
      name: 'Complete high'
    });
    await userEvent.selectOptions(screen.getByLabelText('Engagement switcher'), 'e2');
    await waitFor(() => expect(api.tasks).toHaveBeenCalledWith('e2'));
    await waitFor(() => expect(screen.queryByRole('checkbox', {
      name: 'Complete high'
    })).not.toBeInTheDocument());
    expect(api.scratchpad).toHaveBeenCalledWith('e2');
  });
  it('P1-F10 sidebar collapse and keyboard search navigation', async () => {
    vi.mocked(api.pages).mockResolvedValue([page({
      id: 'sidebar-note',
      title: 'Sidebar note'
    })]);
    renderHome(true);
    await screen.findByRole('textbox', {
      name: 'Scratchpad content'
    });
    expect(await screen.findByRole('link', {
      name: /Sidebar note/
    })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {
      name: 'Collapse pages'
    }));
    expect(screen.queryByRole('link', {
      name: /Sidebar note/
    })).not.toBeInTheDocument();
    expect(screen.getByRole('button', {
      name: 'Expand pages'
    })).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(screen.getByRole('button', {
      name: 'Collapse sidebar'
    }));
    expect(screen.getByRole('button', {
      name: 'Expand sidebar'
    })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', {
      name: 'Home'
    })).toBeInTheDocument();
    await userEvent.keyboard('{Control>}k{/Control}');
    const search = await screen.findByRole('dialog', {
      name: 'Global search'
    });
    expect(within(search).getByLabelText('Search workspace')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', {
      name: 'Global search'
    })).not.toBeInTheDocument();
  });
});

it('unsupported nodes remain readonly and provide original JSON recovery', async()=>{
 const changes=vi.fn();
 render(<RichEditor content={{type:'doc',content:[{type:'futureBlock',attrs:{preserve:'original'}}]}} onChange={changes}/>);
 await screen.findByRole('alert');
 expect(screen.getByRole('button',{name:'Download original JSON'})).toBeInTheDocument();
 await waitFor(()=>expect(screen.getByRole('textbox',{name:'Document'})).toHaveAttribute('contenteditable','false'));
 expect(changes).not.toHaveBeenCalled();
});
