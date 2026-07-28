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
        'cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing dark:border-slate-700 dark:bg-slate-900',
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
            className="w-[290px] shrink-0 rounded-2xl bg-slate-100/80 p-3 dark:bg-slate-950/60"
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
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-400 dark:bg-slate-800">
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
