import { Timeline } from './timeline';

export function ActivityFeed({
  items,
}: {
  readonly items: { id: string; title: string; detail?: string; date?: string }[];
}): React.ReactElement {
  return <Timeline items={items} />;
}
