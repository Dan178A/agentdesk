import { create } from 'zustand';
import type { PreviewContent } from '../lib/preview';

type PanelMode = 'preview' | 'status';

interface PreviewState {
  open: boolean;
  content: PreviewContent | null;
  /** Modo del panel derecho: vista previa o estado (memoria/uso, v2.6). */
  mode: PanelMode;
  show: (content: PreviewContent) => void;
  closePreview: () => void;
  close: () => void;
  toggle: () => void;
  openStatus: () => void;
  setStatusMode: (mode: PanelMode) => void;
}

/** Panel derecho (v2.0 + modo estado v2.6). */
export const usePreviewStore = create<PreviewState>((set, get) => ({
  open: false,
  content: null,
  mode: 'preview',
  show: (content) => set({ open: true, content, mode: 'preview' }),
  closePreview: () => set({ content: null, mode: 'status' }),
  close: () => set({ open: false }),
  toggle: () => set({ open: !get().open }),
  openStatus: () => set({ open: true, mode: 'status' }),
  setStatusMode: (mode) => set({ mode, open: true }),
}));
