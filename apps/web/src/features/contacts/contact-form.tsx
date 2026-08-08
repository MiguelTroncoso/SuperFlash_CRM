'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { phoneMatchesCountry } from '@superflash/utils';

import { CountryPhoneField } from '@/components/shared/country-phone-field';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import type { Contact, Tag } from '@/lib/types';

const CONTACT_SOURCES = ['MANUAL', 'WHATSAPP', 'META_ADS', 'REFERIDO', 'ORGANICO', 'OTRO'] as const;

const schema = z
  .object({
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional(),
    email: z.string().email('Correo inválido.').or(z.literal('')).optional(),
    phone: z.string().max(50).optional(),
    country: z.string().max(2).optional(),
    source: z.string().max(80).optional(),
    notes: z.string().max(4000).optional(),
    tagIds: z.array(z.string()),
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
  )
  .refine(
    (value) =>
      !value.phone?.trim() || !value.country || phoneMatchesCountry(value.phone, value.country),
    { message: 'El prefijo telefónico no coincide con el país.', path: ['phone'] },
  );

export type ContactFormValues = z.infer<typeof schema>;

export function ContactForm({
  contact,
  submitting,
  onSubmit,
  onCancel,
  tags = [],
}: {
  readonly contact: Contact;
  readonly submitting: boolean;
  readonly onSubmit: (values: ContactFormValues) => void;
  readonly onCancel: () => void;
  readonly tags?: Tag[];
}): React.ReactElement {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
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
      tagIds: [],
    },
  });
  const country = watch('country') ?? '';
  const phone = watch('phone') ?? '';
  const selectedTags = watch('tagIds') ?? [];

  useEffect(() => {
    register('country');
    register('phone');
    register('tagIds');
  }, [register]);

  useEffect(() => {
    reset({
      firstName: contact.firstName ?? '',
      lastName: contact.lastName ?? '',
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      country: contact.country ?? '',
      source: contact.source ?? 'MANUAL',
      notes: '',
      tagIds: [],
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
      <CountryPhoneField
        country={country}
        countryError={errors.country?.message}
        onCountryChange={(value) => setValue('country', value, { shouldValidate: true })}
        onPhoneChange={(value) => setValue('phone', value, { shouldValidate: true })}
        phone={phone}
        phoneError={errors.phone?.message}
      />
      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
        Fuente
        <Select className="mt-2" {...register('source')}>
          {CONTACT_SOURCES.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </Select>
      </label>
      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
        Notas
        <Textarea className="mt-2" {...register('notes')} />
      </label>
      {tags.length > 0 ? (
        <fieldset>
          <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Etiquetas
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {tags.map((tag) => {
              const checked = selectedTags.includes(tag.id);
              return (
                <label
                  className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold ${checked ? 'border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}
                  key={tag.id}
                >
                  <input
                    checked={checked}
                    className="sr-only"
                    onChange={() =>
                      setValue(
                        'tagIds',
                        checked
                          ? selectedTags.filter((id) => id !== tag.id)
                          : [...selectedTags, tag.id],
                        { shouldDirty: true },
                      )
                    }
                    type="checkbox"
                  />
                  {tag.name}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      {errors.root ? (
        <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{errors.root.message}</p>
      ) : null}
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancelar
        </Button>
        <Button disabled={submitting} type="submit">
          {submitting ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  );
}
