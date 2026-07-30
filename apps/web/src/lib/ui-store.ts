import { create } from 'zustand';

interface UiStore {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  commandOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  toggleSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleTheme: () => void;
}

const applyTheme = (theme: 'light' | 'dark' | 'system'): void => {
  if (typeof document === 'undefined') return;
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
};

const readTheme = (): 'light' | 'dark' | 'system' => {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem('superflash-theme');
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
};

const readCollapsed = (): boolean =>
  typeof window !== 'undefined' &&
  window.localStorage.getItem('superflash-sidebar') === 'collapsed';

export const useUiStore = create<UiStore>((set) => ({
  sidebarCollapsed: readCollapsed(),
  mobileSidebarOpen: false,
  commandOpen: false,
  theme: readTheme(),
  toggleSidebar: () =>
    set((state) => {
      const sidebarCollapsed = !state.sidebarCollapsed;
      if (typeof window !== 'undefined')
        window.localStorage.setItem(
          'superflash-sidebar',
          sidebarCollapsed ? 'collapsed' : 'expanded',
        );
      return { sidebarCollapsed };
    }),
  setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setTheme: (theme) => {
    if (typeof window !== 'undefined') window.localStorage.setItem('superflash-theme', theme);
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((state) => {
      const theme = state.theme === 'dark' ? 'light' : 'dark';
      if (typeof window !== 'undefined') window.localStorage.setItem('superflash-theme', theme);
      applyTheme(theme);
      return { theme };
    }),
}));

if (typeof window !== 'undefined') {
  applyTheme(readTheme());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useUiStore.getState().theme === 'system') applyTheme('system');
  });
}
