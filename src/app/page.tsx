"use client";

import { startTransition, useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import styles from "./page.module.css";

type Note = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
};

const STORAGE_KEY = "papertrail-notes";

export default function Home() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const restoreNotes = useEffectEvent(() => {
    try {
      const savedNotes = window.localStorage.getItem(STORAGE_KEY);
      if (savedNotes) {
        const parsedNotes = JSON.parse(savedNotes) as Note[];
        if (Array.isArray(parsedNotes)) {
          setNotes(parsedNotes);
          setSelectedId(parsedNotes[0]?.id ?? null);
        }
      }
    } catch {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
    setIsHydrated(true);
  });

  useEffect(() => {
    startTransition(() => restoreNotes());
  }, []);

  useEffect(() => {
    if (isHydrated) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    }
  }, [isHydrated, notes]);

  useEffect(() => {
    if (isEditing) titleInputRef.current?.focus();
  }, [isEditing]);

  const filteredNotes = notes
    .filter((note) => `${note.title} ${note.content}`.toLowerCase().includes(query.toLowerCase()))
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  const selectedNote = notes.find((note) => note.id === selectedId) ?? null;

  function startNewNote() {
    setSelectedId(null);
    setTitle("");
    setContent("");
    setIsEditing(true);
  }

  function startEditing(note: Note) {
    setTitle(note.title);
    setContent(note.content);
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
    if (selectedNote) {
      setNotes((currentNotes) => currentNotes.map((note) =>
        note.id === selectedNote.id
          ? { ...note, title: cleanTitle, content: content.trim(), updatedAt }
          : note,
      ));
    } else {
      const newNote = {
        id: crypto.randomUUID(),
        title: cleanTitle,
        content: content.trim(),
        updatedAt,
      };
      setNotes((currentNotes) => [newNote, ...currentNotes]);
      setSelectedId(newNote.id);
    }
    setIsEditing(false);
  }

  function deleteNote(noteId: string) {
    const remainingNotes = notes.filter((note) => note.id !== noteId);
    setNotes(remainingNotes);
    setSelectedId(remainingNotes[0]?.id ?? null);
    setIsEditing(false);
  }

  function formatDate(date: string) {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(date));
  }

  return (
    <div className={styles.appShell}>
      <aside className={styles.sidebar}>
        <a className={styles.brand} href="#notes" aria-label="Papertrail home">
          <span className={styles.brandMark} aria-hidden="true"><i /><i /><i /></span>
          <span>papertrail</span>
        </a>
        <div className={styles.sidebarSection}>
          <p className={styles.sidebarLabel}>YOUR SPACE</p>
          <button className={styles.navItem} type="button" onClick={() => setSelectedId(notes[0]?.id ?? null)}>
            <span className={styles.navIcon} aria-hidden="true">N</span>
            <span>All notes</span>
            <span className={styles.noteCount}>{notes.length}</span>
          </button>
        </div>
        <div className={styles.sidebarBottom}>
          <div className={styles.profileMark} aria-hidden="true">P</div>
          <div><p className={styles.profileName}>Personal space</p><p className={styles.profileCaption}>Saved on this device</p></div>
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
          <p className={styles.resultCount}>{notes.length} {notes.length === 1 ? "note" : "notes"}</p>
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
                <span className={styles.noteItemTopline}><span className={styles.noteItemDate}>{formatDate(note.updatedAt)}</span><span className={styles.noteItemDot} aria-hidden="true" /></span>
                <span className={styles.noteItemTitle}>{note.title}</span>
                <span className={styles.noteItemPreview}>{note.content || "No additional text"}</span>
              </button>
            )) : (
              <div className={styles.listEmpty}>
                <span className={styles.emptyDash} aria-hidden="true">-</span>
                <p>{query ? "No notes match that search." : "Nothing here yet."}</p>
                {!query && <button type="button" onClick={startNewNote}>Write your first note</button>}
              </div>
            )}
          </div>

          <div className={styles.noteDetail}>
            {isEditing ? (
              <form className={styles.editor} onSubmit={saveNote}>
                <div className={styles.editorHeader}><span className={styles.editorLabel}>{selectedNote ? "EDITING NOTE" : "NEW NOTE"}</span><button className={styles.textButton} type="button" onClick={() => setIsEditing(false)}>Cancel</button></div>
                <input ref={titleInputRef} className={styles.titleInput} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Give your note a title" aria-label="Note title" maxLength={120} required />
                <textarea className={styles.contentInput} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Start writing..." aria-label="Note content" />
                <div className={styles.editorFooter}><span className={styles.saveHint}>Your notes are saved on this device.</span><button className={styles.saveButton} type="submit">Save note</button></div>
              </form>
            ) : selectedNote ? (
              <article className={styles.noteArticle}>
                <div className={styles.articleTopline}><span className={styles.articleDate}>UPDATED {formatDate(selectedNote.updatedAt).toUpperCase()}</span><div className={styles.articleActions}><button className={styles.textButton} type="button" onClick={() => startEditing(selectedNote)}>Edit</button><button className={styles.deleteButton} type="button" onClick={() => deleteNote(selectedNote.id)}>Delete</button></div></div>
                <h2>{selectedNote.title}</h2>
                <div className={styles.articleRule} />
                <p className={styles.articleContent}>{selectedNote.content || <span className={styles.placeholderText}>This note is ready for your thoughts.</span>}</p>
              </article>
            ) : (
              <div className={styles.detailEmpty}>
                <div className={styles.paperIllustration} aria-hidden="true"><i /><i /><i /></div>
                <h2>{query ? "No note selected" : "Make room for a thought."}</h2>
                <p>{query ? "Try another search, or choose a note from your list." : "The best ideas tend to show up unannounced. Give yours a place to land."}</p>
                {!query && <button className={styles.emptyCreateButton} type="button" onClick={startNewNote}>Start a note <span aria-hidden="true">-</span></button>}
              </div>
            )}
          </div>
        </section>
        <footer className={styles.workspaceFooter}><span>MADE FOR THE THINGS YOU DON&apos;T WANT TO FORGET</span><span className={styles.footerLine} /><span>{String(notes.length).padStart(2, "0")} NOTES</span></footer>
      </main>
    </div>
  );
}
