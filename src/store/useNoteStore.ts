import { create } from 'zustand';

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at?: string;
  is_pinned?: boolean;
  is_starred?: boolean;
}

export interface NoteMeta {
  id: string;
  title: string;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
  is_pinned?: boolean;
  is_starred?: boolean;
  type?: 'regular' | 'markdown';
  is_public?: boolean;
}

export interface NoteContent {
  content: string;
  is_public: boolean;
  tags: string[];
  category: string;
  type: 'regular' | 'markdown';
}

interface NoteStore {
  folders: Folder[];
  notes: NoteMeta[];
  noteContents: Record<string, NoteContent>;
  setFolders: (folders: Folder[]) => void;
  setNotes: (notes: NoteMeta[]) => void;
  updateNoteMeta: (id: string, updates: Partial<NoteMeta>) => void;
  updateFolderMeta: (id: string, updates: Partial<Folder>) => void;
  setNoteContent: (id: string, content: NoteContent) => void;
}

export const useNoteStore = create<NoteStore>((set) => ({
  folders: [],
  notes: [],
  noteContents: {},
  setFolders: (folders) => set({ folders }),
  setNotes: (notes) => set({ notes }),
  updateNoteMeta: (id, updates) => set((state) => ({
    notes: state.notes.map(note => note.id === id ? { ...note, ...updates } : note)
  })),
  updateFolderMeta: (id, updates) => set((state) => ({
    folders: state.folders.map(folder => folder.id === id ? { ...folder, ...updates } : folder)
  })),
  setNoteContent: (id, content) => set((state) => ({
    noteContents: { ...state.noteContents, [id]: content }
  }))
}));
