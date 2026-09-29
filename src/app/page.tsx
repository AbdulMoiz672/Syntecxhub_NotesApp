"use client";

import { startTransition, useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import styles from "./page.module.css";
import {
  DEFAULT_FOLDER,
  emptyWorkspace,
  mergeWorkspaces,
  parseWorkspace,
  type Note,
  type Workspace,
} from "../lib/workspace";

const STORAGE_KEY = "papertrail-notes";
const ALL_FOLDERS = "All folders";
const ALL_TAGS = "All tags";
type AuthMode = "login" | "register";
type SyncStatus = "checking" | "local" | "syncing" | "synced" | "error";

async function readWorkspaceResponse(response: Response): Promise<Workspace> {
  const body = await response.json() as Workspace | { error?: string };
  if (!response.ok) {
    throw new Error("error" in body && body.error ? body.error : "Unable to sync the workspace.");
  }
  const workspace = parseWorkspace(body);
  if (!workspace) throw new Error("The server returned invalid workspace data.");
  return workspace;
}

async function saveCloudWorkspace(workspace: Workspace) {
  return readWorkspaceResponse(await fetch("/api/workspace", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(workspace),
  }));
}

export default function Home() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<string[]>([DEFAULT_FOLDER]);
  const [deletedNoteIds, setDeletedNoteIds] = useState<Record<string, string>>({});
  const [deletedFolders, setDeletedFolders] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState(ALL_FOLDERS);
  const [selectedTag, setSelectedTag] = useState(ALL_TAGS);
  const [query, setQuery] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [noteFolder, setNoteFolder] = useState(DEFAULT_FOLDER);
  const [tagInput, setTagInput] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [isCloudReady, setIsCloudReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("checking");
  const titleInputRef = useRef<HTMLInputElement>(null);

  function applyWorkspace(workspace: Workspace) {
    setNotes(workspace.notes);
    setFolders(workspace.folders);
    setDeletedNoteIds(workspace.deletedNoteIds);
    setDeletedFolders(workspace.deletedFolders);
    setSelectedId((currentId) => workspace.notes.some((note) => note.id === currentId)
      ? currentId
      : workspace.notes[0]?.id ?? null);
  }

  const restoreNotes = useEffectEvent(() => {
    let workspace = emptyWorkspace();
    try {
      const savedNotes = window.localStorage.getItem(STORAGE_KEY);
      if (savedNotes) {
        const parsed = JSON.parse(savedNotes) as unknown;
        const legacyWorkspace = Array.isArray(parsed) ? { notes: parsed } : parsed;
        workspace = parseWorkspace(legacyWorkspace) ?? emptyWorkspace();
      }
    } catch {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        setSyncStatus("error");
      }
    }
    setNotes(workspace.notes);
    setFolders(workspace.folders);
    setDeletedNoteIds(workspace.deletedNoteIds);
    setDeletedFolders(workspace.deletedFolders);
    setSelectedId(workspace.notes[0]?.id ?? null);
    setIsHydrated(true);
  });

  useEffect(() => {
    startTransition(() => restoreNotes());
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ notes, folders, deletedNoteIds, deletedFolders }));
    } catch (error) {
      console.error("Unable to save the local workspace.", error);
    }
  }, [deletedFolders, deletedNoteIds, folders, isHydrated, notes]);

  const initializeCloudSession = useEffectEvent(async () => {
    try {
      const response = await fetch("/api/auth", { cache: "no-store" });
      const session = await response.json() as { authenticated?: boolean; email?: string };
      if (!response.ok) throw new Error("Could not check the sync account.");
      if (!session.authenticated || !session.email) {
        setSyncStatus("local");
        return;
      }

      setAccountEmail(session.email);
      const remoteResponse = await fetch("/api/workspace", { cache: "no-store" });
      const remote = await readWorkspaceResponse(remoteResponse);
      const local = parseWorkspace({ notes, folders, deletedNoteIds, deletedFolders }) ?? emptyWorkspace();
      const merged = mergeWorkspaces(remote, local);
      applyWorkspace(await saveCloudWorkspace(merged));
      setSyncStatus("synced");
    } catch {
      setSyncStatus("error");
    } finally {
      setIsCloudReady(true);
    }
  });

  useEffect(() => {
    if (!isHydrated) return;
    const timer = window.setTimeout(() => void initializeCloudSession(), 0);
    return () => window.clearTimeout(timer);
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated || !isCloudReady || !accountEmail) return;
    const snapshot = { notes, folders, deletedNoteIds, deletedFolders };

    const pushTimer = window.setTimeout(async () => {
      setSyncStatus("syncing");
      try {
        const synced = await saveCloudWorkspace(snapshot);
        if (JSON.stringify(synced) !== JSON.stringify(snapshot)) applyWorkspace(synced);
        setSyncStatus("synced");
      } catch {
        setSyncStatus("error");
      }
    }, 700);

    const pollTimer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        const remote = await readWorkspaceResponse(response);
        const merged = mergeWorkspaces(remote, snapshot);
        if (JSON.stringify(merged) !== JSON.stringify(snapshot)) applyWorkspace(merged);
        if (JSON.stringify(merged) !== JSON.stringify(remote)) await saveCloudWorkspace(merged);
        setSyncStatus("synced");
      } catch {
        setSyncStatus("error");
      }
    }, 30000);

    return () => {
      window.clearTimeout(pushTimer);
      window.clearInterval(pollTimer);
    };
  }, [accountEmail, deletedFolders, deletedNoteIds, folders, isCloudReady, isHydrated, notes]);

  useEffect(() => {
    if (isEditing) titleInputRef.current?.focus();
  }, [isEditing]);

  const allTags = [...new Set(notes.flatMap((note) => note.tags))].sort((first, second) => first.localeCompare(second));
  const filteredNotes = notes
    .filter((note) => selectedFolder === ALL_FOLDERS || note.folder === selectedFolder)
    .filter((note) => selectedTag === ALL_TAGS || note.tags.includes(selectedTag))
    .filter((note) => `${note.title} ${note.content} ${note.folder} ${note.tags.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((first, second) => Number(second.isPinned) - Number(first.isPinned) || second.updatedAt.localeCompare(first.updatedAt));
  const selectedNote = (isEditing ? notes : filteredNotes).find((note) => note.id === selectedId) ?? null;

  function startNewNote() {
    setSelectedId(null);
    setTitle("");
    setContent("");
    setNoteFolder(selectedFolder === ALL_FOLDERS ? DEFAULT_FOLDER : selectedFolder);
    setTagInput("");
    setIsEditing(true);
  }

  function startEditing(note: Note) {
    setTitle(note.title);
    setContent(note.content);
    setNoteFolder(note.folder);
    setTagInput(note.tags.join(", "));
    setIsEditing(true);
  }

  function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      titleInputRef.current?.focus();
      return;
    }

    const updatedAt = new Date().toISOString();
    const cleanTags = [...new Set(tagInput.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean))].slice(0, 20);
    const cleanFolder = folders.includes(noteFolder) ? noteFolder : DEFAULT_FOLDER;
    if (selectedNote) {
      setNotes((currentNotes) => currentNotes.map((note) => note.id === selectedNote.id
        ? { ...note, title: cleanTitle, content: content.trim(), folder: cleanFolder, tags: cleanTags, updatedAt }
        : note));
    } else {
      const newNote: Note = {
        id: crypto.randomUUID(),
        title: cleanTitle,
        content: content.trim(),
        updatedAt,
        folder: cleanFolder,
        tags: cleanTags,
        isPinned: false,
      };
      setNotes((currentNotes) => [newNote, ...currentNotes]);
      setSelectedId(newNote.id);
    }
    setIsEditing(false);
  }

  function deleteNote(noteId: string) {
    const deletedAt = new Date().toISOString();
    const remainingNotes = notes.filter((note) => note.id !== noteId);
    setNotes(remainingNotes);
    setDeletedNoteIds((current) => ({ ...current, [noteId]: deletedAt }));
    setSelectedId(remainingNotes[0]?.id ?? null);
    setIsEditing(false);
  }

  function togglePinned(note: Note) {
    const updatedAt = new Date().toISOString();
    setNotes((currentNotes) => currentNotes.map((current) => current.id === note.id
      ? { ...current, isPinned: !current.isPinned, updatedAt }
      : current));
  }

  function saveFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const folder = newFolderName.trim().slice(0, 40);
    if (!folder || folders.some((current) => current.toLowerCase() === folder.toLowerCase())) return;
    setFolders((current) => [...current, folder]);
    setDeletedFolders((current) => {
      const remaining = { ...current };
      delete remaining[folder];
      return remaining;
    });
    setSelectedFolder(folder);
    setNoteFolder(folder);
    setNewFolderName("");
    setIsFolderDialogOpen(false);
  }

  function deleteFolder(folder: string) {
    if (folder === DEFAULT_FOLDER || !window.confirm(`Delete "${folder}" and move its notes to ${DEFAULT_FOLDER}?`)) return;
    const updatedAt = new Date().toISOString();
    setDeletedFolders((current) => ({ ...current, [folder]: updatedAt }));
    setFolders((current) => current.filter((item) => item !== folder));
    setNotes((current) => current.map((note) => note.folder === folder
      ? { ...note, folder: DEFAULT_FOLDER, updatedAt }
      : note));
    if (selectedFolder === folder) setSelectedFolder(ALL_FOLDERS);
    if (noteFolder === folder) setNoteFolder(DEFAULT_FOLDER);
  }

  function exportWorkspace() {
    const data = JSON.stringify({ exportedAt: new Date().toISOString(), notes, folders }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `papertrail-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    if (authMode === "register" && password !== confirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }
    setIsAuthBusy(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, confirmPassword, mode: authMode }),
      });
      const result = await response.json() as { email?: string; error?: string };
      if (!response.ok || !result.email) throw new Error(result.error || "Unable to sign in.");

      const local = parseWorkspace({ notes, folders, deletedNoteIds, deletedFolders }) ?? emptyWorkspace();
      const merged = await saveCloudWorkspace(local);
      applyWorkspace(merged);
      setAccountEmail(result.email);
      setIsCloudReady(true);
      setSyncStatus("synced");
      setPassword("");
      setConfirmPassword("");
      setIsPasswordVisible(false);
      setIsAccountDialogOpen(false);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to connect to MongoDB sync.");
    } finally {
      setIsAuthBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    setAccountEmail(null);
    setIsCloudReady(false);
    setSyncStatus("local");
  }

  function closeAccountDialog() {
    setIsAccountDialogOpen(false);
    setPassword("");
    setConfirmPassword("");
    setIsPasswordVisible(false);
    setAuthError("");
  }

  function formatDate(date: string) {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(date));
  }

  const syncLabel: Record<SyncStatus, string> = {
    checking: "Checking sync status",
    local: "Saved on this device",
    syncing: "Syncing to MongoDB",
    synced: "Synced to MongoDB",
    error: "Sync unavailable",
  };

  return (
    <div className={styles.appShell}>
      <aside className={styles.sidebar}>
        <a className={styles.brand} href="#notes" aria-label="Papertrail home">
          <span className={styles.brandMark} aria-hidden="true"><i /><i /><i /></span>
          <span>papertrail</span>
        </a>
        <div className={styles.sidebarSection}>
          <p className={styles.sidebarLabel}>YOUR SPACE</p>
          <button className={`${styles.navItem} ${selectedFolder === ALL_FOLDERS ? styles.navItemActive : ""}`} type="button" onClick={() => setSelectedFolder(ALL_FOLDERS)}>
            <span className={styles.navIcon} aria-hidden="true">N</span>
            <span>All notes</span>
            <span className={styles.noteCount}>{notes.length}</span>
          </button>
          <div className={styles.folderHeading}><span>FOLDERS</span><button type="button" className={styles.addFolderButton} aria-label="Create folder" title="Create folder" onClick={() => setIsFolderDialogOpen(true)}>+</button></div>
          <div className={styles.folderList}>
            {folders.map((folder) => (
              <div className={styles.folderRow} key={folder}>
                <button className={`${styles.navItem} ${styles.folderNavItem} ${selectedFolder === folder ? styles.navItemActive : ""}`} type="button" onClick={() => setSelectedFolder(folder)}>
                  <span className={styles.folderGlyph} aria-hidden="true">F</span>
                  <span className={styles.folderName}>{folder}</span>
                  <span className={styles.noteCount}>{notes.filter((note) => note.folder === folder).length}</span>
                </button>
                {folder !== DEFAULT_FOLDER && <button className={styles.removeFolderButton} type="button" title={`Delete ${folder} folder`} aria-label={`Delete ${folder} folder`} onClick={() => deleteFolder(folder)}>x</button>}
              </div>
            ))}
          </div>
        </div>
        <div className={styles.sidebarBottom}>
          <div className={styles.profileMark} aria-hidden="true">{accountEmail ? accountEmail[0].toUpperCase() : "P"}</div>
          <div className={styles.profileDetails}>
            <p className={styles.profileName}>{accountEmail || "Personal space"}</p>
            <p className={styles.profileCaption}>{syncLabel[syncStatus]}</p>
          </div>
          {accountEmail
            ? <button className={styles.accountButton} type="button" title="Sign out of cloud sync" onClick={signOut}>Out</button>
            : <button className={styles.accountButton} type="button" title="Set up cloud sync" onClick={() => { setAuthError(""); setIsAccountDialogOpen(true); }}>Sync</button>}
        </div>
      </aside>

      <main className={styles.workspace} id="notes">
        <header className={styles.pageHeader}>
          <div><p className={styles.eyebrow}>A LITTLE SPACE TO THINK</p><h1>Your notes<span>.</span></h1></div>
          <button className={styles.newNoteButton} type="button" onClick={startNewNote}><span aria-hidden="true">+</span> New note</button>
        </header>
        <div className={styles.toolbar}>
          <label className={styles.searchBox}>
            <span className={styles.searchIcon} aria-hidden="true" />
            <span className={styles.visuallyHidden}>Search notes</span>
            <input type="search" placeholder="Find a note..." value={query} onChange={(event) => setQuery(event.target.value)} />
            <span className={styles.searchShortcut} aria-hidden="true">/</span>
          </label>
          <div className={styles.toolbarControls}>
            <p className={styles.resultCount}>{filteredNotes.length} {filteredNotes.length === 1 ? "note" : "notes"}</p>
            <label className={styles.filterControl}><span>Folder</span><select value={selectedFolder} onChange={(event) => setSelectedFolder(event.target.value)}><option value={ALL_FOLDERS}>{ALL_FOLDERS}</option>{folders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}</select></label>
            <label className={styles.filterControl}><span>Tag</span><select value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)}><option value={ALL_TAGS}>{ALL_TAGS}</option>{allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select></label>
            <button className={styles.utilityButton} type="button" onClick={() => { setNewFolderName(""); setIsFolderDialogOpen(true); }}>New folder</button>
            <button className={styles.utilityButton} type="button" onClick={exportWorkspace} disabled={notes.length === 0} title="Export notes as JSON">Export</button>
          </div>
        </div>

        <section className={styles.notesWorkspace} aria-label="Notes">
          <div className={styles.noteList}>
            {filteredNotes.length > 0 ? filteredNotes.map((note) => (
              <button
                className={`${styles.noteListItem} ${selectedId === note.id && !isEditing ? styles.noteListItemActive : ""}`}
                key={note.id}
                type="button"
                onClick={() => { setSelectedId(note.id); setIsEditing(false); }}
              >
                <span className={styles.noteItemTopline}><span className={styles.noteItemDate}>{formatDate(note.updatedAt)} · {note.folder}</span>{note.isPinned && <span className={styles.pinnedBadge}>PINNED</span>}</span>
                <span className={styles.noteItemTitle}>{note.title}</span>
                <span className={styles.noteItemPreview}>{note.content || "No additional text"}</span>
                {note.tags.length > 0 && <span className={styles.noteTagList}>{note.tags.map((tag) => <span className={styles.noteTag} key={tag}>{tag}</span>)}</span>}
              </button>
            )) : (
              <div className={styles.listEmpty}>
                <span className={styles.emptyDash} aria-hidden="true">-</span>
                <p>{query || selectedTag !== ALL_TAGS || selectedFolder !== ALL_FOLDERS ? "No notes match these filters." : "Nothing here yet."}</p>
                {notes.length === 0 && <button type="button" onClick={startNewNote}>Write your first note</button>}
              </div>
            )}
          </div>

          <div className={styles.noteDetail}>
            {isEditing ? (
              <form className={styles.editor} onSubmit={saveNote}>
                <div className={styles.editorHeader}><span className={styles.editorLabel}>{selectedNote ? "EDITING NOTE" : "NEW NOTE"}</span><button className={styles.textButton} type="button" onClick={() => setIsEditing(false)}>Cancel</button></div>
                <input ref={titleInputRef} className={styles.titleInput} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Give your note a title" aria-label="Note title" maxLength={120} required />
                <div className={styles.editorOptions}>
                  <label className={styles.editorField}><span>Folder</span><select value={noteFolder} onChange={(event) => setNoteFolder(event.target.value)}>{folders.map((folder) => <option value={folder} key={folder}>{folder}</option>)}</select></label>
                  <label className={styles.editorField}><span>Tags</span><input value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="planning, ideas, reminders" aria-label="Note tags" /></label>
                </div>
                <textarea className={styles.contentInput} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Start writing..." aria-label="Note content" />
                <div className={styles.editorFooter}><span className={styles.saveHint}>{accountEmail ? "Changes sync across your devices." : "Saved on this device."}</span><button className={styles.saveButton} type="submit">Save note</button></div>
              </form>
            ) : selectedNote ? (
              <article className={styles.noteArticle}>
                <div className={styles.articleTopline}><span className={styles.articleDate}>UPDATED {formatDate(selectedNote.updatedAt).toUpperCase()}</span><div className={styles.articleActions}><button className={styles.pinButton} type="button" aria-pressed={selectedNote.isPinned} onClick={() => togglePinned(selectedNote)}>{selectedNote.isPinned ? "Unpin" : "Pin"}</button><button className={styles.textButton} type="button" onClick={() => startEditing(selectedNote)}>Edit</button><button className={styles.deleteButton} type="button" onClick={() => deleteNote(selectedNote.id)}>Delete</button></div></div>
                <p className={styles.articleFolder}>{selectedNote.folder}</p>
                <h2>{selectedNote.title}</h2>
                {selectedNote.tags.length > 0 && <div className={styles.articleTags}>{selectedNote.tags.map((tag) => <span className={styles.noteTag} key={tag}>{tag}</span>)}</div>}
                <div className={styles.articleRule} />
                <p className={styles.articleContent}>{selectedNote.content || <span className={styles.placeholderText}>This note is ready for your thoughts.</span>}</p>
              </article>
            ) : (
              <div className={styles.detailEmpty}>
                <div className={styles.paperIllustration} aria-hidden="true"><i /><i /><i /></div>
                <h2>{query || selectedFolder !== ALL_FOLDERS || selectedTag !== ALL_TAGS ? "No note selected" : "Make room for a thought."}</h2>
                <p>{query || selectedFolder !== ALL_FOLDERS || selectedTag !== ALL_TAGS ? "Try changing a filter, or choose a note from your list." : "The best ideas tend to show up unannounced. Give yours a place to land."}</p>
                {notes.length === 0 && <button className={styles.emptyCreateButton} type="button" onClick={startNewNote}>Start a note <span aria-hidden="true">-</span></button>}
              </div>
            )}
          </div>
        </section>
        <footer className={styles.workspaceFooter}><span>MADE FOR THE THINGS YOU DON&apos;T WANT TO FORGET</span><span className={styles.footerLine} /><span>{String(notes.length).padStart(2, "0")} NOTES</span></footer>
      </main>

      {isFolderDialogOpen && <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setIsFolderDialogOpen(false); }}>
        <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="folder-dialog-title">
          <div className={styles.modalHeader}><div><p className={styles.eyebrow}>ORGANIZE YOUR SPACE</p><h2 id="folder-dialog-title">New folder</h2></div><button className={styles.modalClose} type="button" aria-label="Close" onClick={() => setIsFolderDialogOpen(false)}>x</button></div>
          <form onSubmit={saveFolder}><label className={styles.modalField}><span>Folder name</span><input autoFocus value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} maxLength={40} required /></label><div className={styles.modalFooter}><button className={styles.textButton} type="button" onClick={() => setIsFolderDialogOpen(false)}>Cancel</button><button className={styles.saveButton} type="submit">Create folder</button></div></form>
        </section>
      </div>}

      {isAccountDialogOpen && <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) closeAccountDialog(); }}>
        <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="account-dialog-title">
          <div className={styles.modalHeader}><div><p className={styles.eyebrow}>MONGODB CLOUD SYNC</p><h2 id="account-dialog-title">{authMode === "login" ? "Sign in to sync" : "Create your account"}</h2></div><button className={styles.modalClose} type="button" aria-label="Close" onClick={closeAccountDialog}>x</button></div>
          <div className={styles.authModes}>
            <button type="button" className={authMode === "login" ? styles.authModeActive : ""} onClick={() => { setAuthMode("login"); setAuthError(""); setConfirmPassword(""); }}>Sign in</button>
            <button type="button" className={authMode === "register" ? styles.authModeActive : ""} onClick={() => { setAuthMode("register"); setAuthError(""); }}>Create account</button>
          </div>
          <form onSubmit={submitAuth}>
            <label className={styles.modalField}>
              <span>Email</span>
              <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <div className={styles.modalField}>
              <label htmlFor="account-password">Password</label>
              <span className={styles.passwordControl}>
                <input id="account-password" type={isPasswordVisible ? "text" : "password"} autoComplete={authMode === "login" ? "current-password" : "new-password"} aria-describedby={authMode === "register" ? "password-hint" : undefined} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={72} required />
                <button className={styles.passwordToggle} type="button" aria-label={isPasswordVisible ? "Hide password" : "Show password"} aria-pressed={isPasswordVisible} onClick={() => setIsPasswordVisible((visible) => !visible)}>{isPasswordVisible ? "Hide" : "Show"}</button>
              </span>
              {authMode === "register" && <span id="password-hint" className={styles.passwordHint}>Use at least 8 characters. Maximum 72 UTF-8 bytes.</span>}
            </div>
            {authMode === "register" && <label className={styles.modalField}>
              <span>Confirm password</span>
              <input type={isPasswordVisible ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} maxLength={72} required />
            </label>}
            {authError && <p className={styles.formError} role="alert">{authError}</p>}
            <div className={styles.modalFooter}>
              <span className={styles.saveHint}>Your password is stored as a secure hash.</span>
              <button className={styles.saveButton} type="submit" disabled={isAuthBusy}>{isAuthBusy ? "Connecting..." : authMode === "login" ? "Sign in" : "Create account"}</button>
            </div>
          </form>
        </section>
      </div>}
    </div>
  );
}
