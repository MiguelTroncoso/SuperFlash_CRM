'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { useToastStore } from '@/components/ui/toast';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

interface ProfileForm {
  firstName: string;
  lastName: string;
  phone: string;
  timezone: string;
}

const TIMEZONES = [
  'America/Santiago',
  'America/Lima',
  'America/Mexico_City',
  'America/New_York',
  'UTC',
];

export function ProfilePage(): React.ReactElement {
  const setUser = useAuthStore((state) => state.setUser);
  const toast = useToastStore((state) => state.push);
  const profile = useQuery({ queryKey: ['profile'], queryFn: api.getProfile });
  const form = useForm<ProfileForm>({
    defaultValues: { firstName: '', lastName: '', phone: '', timezone: 'America/Santiago' },
  });
  useEffect(() => {
    if (!profile.data) return;
    form.reset({
      firstName: profile.data.firstName,
      lastName: profile.data.lastName ?? '',
      phone: profile.data.phone ?? '',
      timezone: profile.data.timezone,
    });
  }, [form, profile.data]);
  const save = useMutation({
    mutationFn: (values: ProfileForm) => api.updateProfile({ ...values }),
    onSuccess: (user) => {
      setUser(user);
      toast({
        title: 'Perfil actualizado',
        description: 'Tus preferencias fueron guardadas.',
        tone: 'success',
      });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible guardar', description: error.message, tone: 'error' }),
  });
  return (
    <QueryState
      isError={profile.isError}
      isLoading={profile.isLoading}
      onRetry={() => void profile.refetch()}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Cuenta"
          title="Mi perfil"
          description="Actualiza tus datos personales y zona horaria."
        />
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>Información personal</CardTitle>
            <CardDescription>
              El correo pertenece a tu identidad y no se puede cambiar desde aquí.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={form.handleSubmit((values) => save.mutate(values))}
            >
              <label className="space-y-1 text-sm font-semibold">
                Nombre
                <Input {...form.register('firstName', { required: 'Requerido', maxLength: 100 })} />
              </label>
              <label className="space-y-1 text-sm font-semibold">
                Apellido
                <Input {...form.register('lastName', { maxLength: 100 })} />
              </label>
              <label className="space-y-1 text-sm font-semibold">
                Correo
                <Input disabled value={profile.data?.email ?? ''} />
              </label>
              <label className="space-y-1 text-sm font-semibold">
                Teléfono
                <Input {...form.register('phone', { maxLength: 32 })} placeholder="+569..." />
              </label>
              <label className="space-y-1 text-sm font-semibold md:col-span-2">
                Zona horaria
                <Select {...form.register('timezone')}>
                  {TIMEZONES.map((timezone) => (
                    <option key={timezone} value={timezone}>
                      {timezone}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="md:col-span-2">
                <Button disabled={save.isPending} type="submit">
                  {save.isPending ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </PageGrid>
    </QueryState>
  );
}
