import { RecordModule } from '../features/records/RecordModule';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Shell } from './Shell';
import { Engagements } from '../features/Engagements';
import { Home } from '../features/Home';
import { Tasks } from '../features/Tasks';
import { Pages } from '../features/Pages';
import { PageDetail } from '../features/PageDetail';
import { Settings } from '../features/Settings';
export const routes = [{
  path: '/',
  element: <Engagements />
}, {
  path: '/e/:eid',
  element: <Shell />,
  children: [{
    index: true,
    element: <Navigate to="home" replace />
  }, {
    path: 'home',
    element: <Home />
  }, {
    path: 'tasks',
    element: <Tasks />
  }, {
    path: 'pages',
    element: <Pages />
  }, {
    path: 'pages/:pid',
    element: <PageDetail />
  }, ...([{
    path: 'assets',
    kind: 'asset'
  }, {
    path: 'attack-surfaces',
    kind: 'surface'
  }, {
    path: 'backlog',
    kind: 'backlog'
  }, {
    path: 'test-cases',
    kind: 'test_case'
  }, {
    path: 'findings',
    kind: 'finding'
  }, {
    path: 'evidence',
    kind: 'evidence'
  }] as const).map(route => ({
    path: route.path,
    element: <RecordModule kind={route.kind} />
  })), {
    path: 'settings',
    element: <Settings />
  }]
}, {
  path: '*',
  element: <Navigate to="/" replace />
}];
export const router = createBrowserRouter(routes);
