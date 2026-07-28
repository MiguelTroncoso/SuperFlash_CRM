'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import type { Contact } from '@/lib/types';

const schema = z
  .object({
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional(),
    email: z.string().email('Correo inválido.').or(z.literal('')).optional(),
    phone: z.string().max(50).optional(),
    country: z.string().max(2).optional(),
    source: z.string().max(80).optional(),
    notes: z.string().max(4000).optional(),
  })
  .refine(
    (value) =>
      Boolean(
        value.firstName?.trim() ||
        value.lastName?.trim() ||
        value.email?.trim() ||
        value.phone?.trim(),
      ),
    { message: 'Ingresa al menos un nombre, correo o teléfono.', path: ['root'] },
  );
export type ContactFormValues = z.infer<typeof schema>;

export function ContactForm({
  contact,
  submitting,
  onSubmit,
  onCancel,
}: {
  readonly contact?: Contact | null;
  readonly submitting: boolean;
  readonly onSubmit: (values: ContactFormValues) => void;
  readonly onCancel: () => void;
}): React.ReactElement {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      country: '',
      source: 'MANUAL',
      notes: '',
    },
  });
  useEffect(() => {
    reset({
      firstName: contact?.firstName ?? '',
      lastName: contact?.lastName ?? '',
      email: contact?.email ?? '',
      phone: contact?.phone ?? '',
      country: contact?.country ?? '',
      source: contact?.source ?? 'MANUAL',
      notes: '',
    });
  }, [contact, reset]);
  return (
    <form className="space-y-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Nombre
          <Input className="mt-2" {...register('firstName')} />
        </label>
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Apellido
          <Input className="mt-2" {...register('lastName')} />
        </label>
      </div>
      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
        Correo
        <Input className="mt-2" type="email" {...register('email')} />
        {errors.email ? (
          <span className="mt-1 block text-xs text-rose-600">{errors.email.message}</span>
        ) : null}
      </label>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Teléfono
          <Input className="mt-2" placeholder="+569..." {...register('phone')} />
        </label>
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          País
          <Select className="mt-2" {...register('country')}>
            <option value="">—</option>
            <option value="CL">CL</option>
            <option value="MX">MX</option>
            <option value="PE">PE</option>
            <option value="US">US</option>
          </Select>
        </label>
      </div>
      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
        Fuente
        <Input className="mt-2" {...register('source')} />
      </label>
      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
        Notas
        <Textarea className="mt-2" {...register('notes')} />
      </label>
      {errors.root ? (
        <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{errors.root.message}</p>
      ) : null}
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancelar
        </Button>
        <Button disabled={submitting} type="submit">
          {submitting ? 'Guardando…' : contact ? 'Guardar cambios' : 'Crear contacto'}
        </Button>
      </div>
    </form>
  );
}
