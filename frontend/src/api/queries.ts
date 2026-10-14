import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
export const keys = {
  engagements: ['engagements'] as const,
  pages: (eid: string) => ['workspace', eid, 'pages'] as const,
  tasks: (eid: string) => ['workspace', eid, 'tasks'] as const,
  page: (eid: string, id: string) => ['workspace', eid, 'page', id] as const,
  scratch: (eid: string) => ['workspace', eid, 'scratch'] as const,
  recent: (eid: string) => ['workspace', eid, 'recent'] as const
};
export const usePages = (eid: string) => useQuery({
  queryKey: keys.pages(eid),
  queryFn: () => api.pages(eid)
});
export const useTasks = (eid: string) => useQuery({
  queryKey: keys.tasks(eid),
  queryFn: () => api.tasks(eid)
});
export function useRefresh(eid: string) {
  const client = useQueryClient();
  return () => client.invalidateQueries({
    queryKey: ['workspace', eid]
  });
}
