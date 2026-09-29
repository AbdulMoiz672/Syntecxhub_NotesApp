export const DEFAULT_FOLDER = "General";

export type Note = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  folder: string;
  tags: string[];
  isPinned: boolean;
};

export type Workspace = {
  notes: Note[];
  folders: string[];
  deletedNoteIds: Record<string, string>;
  deletedFolders: Record<string, string>;
};

export function emptyWorkspace(): Workspace {
  return { notes: [], folders: [DEFAULT_FOLDER], deletedNoteIds: {}, deletedFolders: {} };
}

export function parseWorkspace(value: unknown): Workspace | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.notes) || data.notes.length > 5000) return null;

  const notes: Note[] = [];
  for (const rawNote of data.notes) {
    if (!rawNote || typeof rawNote !== "object") return null;
    const note = rawNote as Record<string, unknown>;
    if (
      typeof note.id !== "string" || note.id.length > 100 ||
      typeof note.title !== "string" || note.title.trim().length === 0 || note.title.length > 120 ||
      typeof note.content !== "string" || note.content.length > 100000 ||
      typeof note.updatedAt !== "string" || Number.isNaN(Date.parse(note.updatedAt))
    ) return null;

    const folder = typeof note.folder === "string" ? note.folder.trim().slice(0, 40) : DEFAULT_FOLDER;
    const tags = Array.isArray(note.tags)
      ? note.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim().slice(0, 32)).filter(Boolean).slice(0, 20)
      : [];

    notes.push({
      id: note.id,
      title: note.title.trim(),
      content: note.content,
      updatedAt: new Date(note.updatedAt).toISOString(),
      folder: folder || DEFAULT_FOLDER,
      tags: [...new Set(tags)],
      isPinned: note.isPinned === true,
    });
  }

  const folders = Array.isArray(data.folders)
    ? data.folders.filter((folder): folder is string => typeof folder === "string").map((folder) => folder.trim().slice(0, 40)).filter(Boolean).slice(0, 100)
    : [];
  const uniqueFolders = [...new Set([DEFAULT_FOLDER, ...folders, ...notes.map((note) => note.folder)])];
  const rawDeletedIds = data.deletedNoteIds && typeof data.deletedNoteIds === "object"
    ? data.deletedNoteIds as Record<string, unknown>
    : {};
  const deletedNoteIds: Record<string, string> = {};
  for (const [id, date] of Object.entries(rawDeletedIds).slice(-10000)) {
    if (id.length <= 100 && typeof date === "string" && !Number.isNaN(Date.parse(date))) {
      deletedNoteIds[id] = new Date(date).toISOString();
    }
  }

  const rawDeletedFolders = data.deletedFolders && typeof data.deletedFolders === "object"
    ? data.deletedFolders as Record<string, unknown>
    : {};
  const deletedFolders: Record<string, string> = {};
  for (const [folder, date] of Object.entries(rawDeletedFolders).slice(-1000)) {
    if (folder.length <= 40 && typeof date === "string" && !Number.isNaN(Date.parse(date))) {
      deletedFolders[folder] = new Date(date).toISOString();
    }
  }

  return {
    notes,
    folders: uniqueFolders.filter((folder) => folder === DEFAULT_FOLDER || !deletedFolders[folder]),
    deletedNoteIds,
    deletedFolders,
  };
}

export function mergeWorkspaces(first: Workspace, second: Workspace): Workspace {
  const notesById = new Map<string, Note>();
  for (const note of [...first.notes, ...second.notes]) {
    const current = notesById.get(note.id);
    if (!current || note.updatedAt > current.updatedAt) notesById.set(note.id, note);
  }

  const deletedNoteIds = { ...first.deletedNoteIds };
  for (const [id, deletedAt] of Object.entries(second.deletedNoteIds)) {
    if (!deletedNoteIds[id] || deletedAt > deletedNoteIds[id]) deletedNoteIds[id] = deletedAt;
  }

  const deletedFolders = { ...first.deletedFolders };
  for (const [folder, deletedAt] of Object.entries(second.deletedFolders)) {
    if (!deletedFolders[folder] || deletedAt > deletedFolders[folder]) deletedFolders[folder] = deletedAt;
  }

  const notes = [...notesById.values()].filter((note) => {
    const deletedAt = deletedNoteIds[note.id];
    return !deletedAt || note.updatedAt > deletedAt;
  });
  const folders = [...new Set([
    DEFAULT_FOLDER,
    ...first.folders,
    ...second.folders,
    ...notes.map((note) => note.folder),
  ])].filter((folder) => folder === DEFAULT_FOLDER || !deletedFolders[folder]).slice(0, 100);

  return { notes, folders, deletedNoteIds, deletedFolders };
}