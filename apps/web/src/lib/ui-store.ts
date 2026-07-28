import { create } from 'zustand';

interface UiStore {
  sidebarCollapsed: boolean;
  commandOpen: boolean;
  theme: 'light' | 'dark';
  toggleSidebar: () => void;
  setCommandOpen: (open: boolean) => void;
  toggleTheme: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  sidebarCollapsed: false,
  commandOpen: false,
  theme: 'light',
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  toggleTheme: () =>
    set((state) => {
      const theme = state.theme === 'light' ? 'dark' : 'light';
      if (typeof document !== 'undefined')
        document.documentElement.classList.toggle('dark', theme === 'dark');
      return { theme };
    }),
}));
