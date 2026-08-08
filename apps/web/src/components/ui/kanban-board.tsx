'use client';

import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface KanbanItem {
  id: string;
  title: string;
  subtitle?: string;
  amount?: string | null;
  status?: string;
  category?: { id: string; name: string } | null;
  product?: { id: string; name: string } | null;
  campaign?: { id: string; name: string } | null;
  assignedTo?: { id: string; firstName: string; lastName: string | null } | null;
  stageName?: string;
  lastStageChangedAt?: string | null;
  nextFollowUp?: { id: string; title: string; dueAt: string; status: string } | null;
}
interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  items: KanbanItem[];
}

function SortableCard({
  item,
  renderItem,
}: {
  readonly item: KanbanItem;
  readonly renderItem?: ((item: KanbanItem) => ReactNode) | undefined;
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn(
        'cursor-grab rounded-xl border border-border-default bg-surface-card p-3 shadow-sm active:cursor-grabbing',
        isDragging && 'opacity-50 ring-2 ring-brand-400',
      )}
    >
      {renderItem ? (
        renderItem(item)
      ) : (
        <>
          <p className="text-sm font-semibold text-slate-800 dark:text-white">{item.title}</p>
          {item.subtitle ? <p className="mt-1 text-xs text-slate-500">{item.subtitle}</p> : null}
          {item.amount ? (
            <p className="mt-3 text-sm font-bold text-brand-700 dark:text-brand-300">
              {item.amount}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export function KanbanBoard({
  columns,
  onMove,
  renderItem,
}: {
  readonly columns: KanbanColumn[];
  readonly onMove?: (itemId: string, targetColumnId: string) => void;
  readonly renderItem?: (item: KanbanItem) => ReactNode;
}): React.ReactElement {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const handleDragEnd = (event: DragEndEvent) => {
    if (!onMove || !event.over || event.active.id === event.over.id) return;
    const target = columns.find(
      (column) =>
        column.items.some((item) => item.id === event.over?.id) || column.id === event.over?.id,
    );
    if (target) onMove(String(event.active.id), target.id);
  };
  return (
    <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
      <div className="flex min-h-[560px] gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <div
            className="w-[min(290px,calc(100vw-2rem))] shrink-0 rounded-2xl bg-surface-inset p-3"
            key={column.id}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: column.color }}
                />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {column.title}
                </h3>
              </div>
              <span className="rounded-full bg-surface-card px-2 py-1 text-[11px] font-bold text-content-muted">
                {column.items.length}
              </span>
            </div>
            <SortableContext
              items={column.items.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {column.items.map((item) => (
                  <SortableCard item={item} key={item.id} renderItem={renderItem} />
                ))}
              </div>
            </SortableContext>
          </div>
        ))}
      </div>
    </DndContext>
  );
}
