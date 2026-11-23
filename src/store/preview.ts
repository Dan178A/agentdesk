import { create } from 'zustand';
import type { PreviewContent } from '../lib/preview';

interface PreviewState {
  open: boolean;
  content: PreviewContent | null;
  show: (content: PreviewContent) => void;
  close: () => void;
  toggle: () => void;
}

/** Panel de vista previa (plan v2.0 Fase 2): abre contenido producido por el modelo. */
export const usePreviewStore = create<PreviewState>((set) => ({
  open: false,
  content: null,
  show: (content) => set({ open: true, content }),
  close: () => set({ open: false }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
