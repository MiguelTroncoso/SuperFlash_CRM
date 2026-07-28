'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/lib/auth-store';
import { api, ApiClientError } from '@/lib/api-client';

const schema = z.object({
  email: z.string().email('Ingresa un correo válido.'),
  password: z.string().min(1, 'Ingresa tu contraseña.'),
});
type LoginForm = z.infer<typeof schema>;

export default function LoginPage(): React.ReactElement {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const setSession = useAuthStore((state) => state.setSession);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });
  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [router, status]);
  const onSubmit = async (values: LoginForm) => {
    try {
      const session = await api.login(values);
      setSession(session.accessToken, session.user);
      router.replace('/');
    } catch (error: unknown) {
      const message =
        error instanceof ApiClientError ? error.message : 'No fue posible iniciar sesión.';
      setError('root', { message });
    }
  };
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_#e0e7ff,_transparent_38%),#f8fafc] px-4 dark:bg-[radial-gradient(circle_at_top_left,_#1e1b4b,_transparent_40%),#070b14]">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-lg font-black text-white shadow-lg shadow-brand-600/20">
            S
          </div>
          <div>
            <p className="text-lg font-black tracking-tight text-slate-950 dark:text-white">
              SuperFlash
            </p>
            <p className="text-xs text-slate-500">Business operating system</p>
          </div>
        </div>
        <Card className="p-7">
          <div className="mb-7">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
              Workspace seguro
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              Bienvenido de vuelta
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Ingresa para continuar gestionando tu operación comercial.
            </p>
          </div>
          <form className="space-y-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Correo
              <Input
                autoComplete="email"
                className="mt-2"
                placeholder="owner@empresa.com"
                type="email"
                {...register('email')}
              />
              {errors.email ? (
                <span className="mt-1 block text-xs text-rose-600">{errors.email.message}</span>
              ) : null}
            </label>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Contraseña
              <Input
                autoComplete="current-password"
                className="mt-2"
                placeholder="••••••••"
                type="password"
                {...register('password')}
              />
              {errors.password ? (
                <span className="mt-1 block text-xs text-rose-600">{errors.password.message}</span>
              ) : null}
            </label>
            {errors.root ? (
              <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
                {errors.root.message}
              </p>
            ) : null}
            <Button className="mt-2 w-full" disabled={isSubmitting} size="lg" type="submit">
              {isSubmitting ? 'Validando…' : 'Entrar al workspace'}
            </Button>
          </form>
        </Card>
        <p className="mt-6 text-center text-xs text-slate-400">
          Tus sesiones usan cookies HttpOnly y tokens de acceso en memoria.
        </p>
      </div>
    </main>
  );
}
