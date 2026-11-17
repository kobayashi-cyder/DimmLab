export type MissionId = "percent" | "coin" | "growth";
export type Note = {
  id: string;
  mission: MissionId;
  prediction: string;
  observation: string;
  insight: string;
  savedAt: string;
};
export const NOTES_KEY = "dimmlab-notes-v1";

function isNote(value: unknown): value is Note {
  if (!value || typeof value !== "object") return false;
  const note = value as Record<string, unknown>;
  return (
    typeof note.id === "string" && note.id.length > 0 &&
    typeof note.mission === "string" && ["percent", "coin", "growth"].includes(note.mission) &&
    ["prediction", "observation", "insight", "savedAt"].every(field => typeof note[field] === "string")
  );
}

// Loading never writes: invalid records must not be silently overwritten.
export function readNotes(storage: Pick<Storage, "getItem">): { notes: Note[]; warning: string; canPersist: boolean } {
  try {
    const raw = storage.getItem(NOTES_KEY);
    if (raw === null) return { notes: [], warning: "", canPersist: true };
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { notes: [], warning: "保存された記録の形式を読み取れません。元の記録は変更していません。", canPersist: false };
    }
    const seen = new Set<string>();
    const notes = parsed.filter((entry): entry is Note => {
      if (!isNote(entry) || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
    return {
      notes,
      canPersist: notes.length === parsed.length,
      warning: notes.length === parsed.length ? "" : "一部の記録を読み込めませんでした。読み取れた記録を表示しています。元の保存データは変更していません。"
    };
  } catch {
    return { notes: [], warning: "記録を読み込めませんでした。この画面では実験を続けられます。元の保存データは変更していません。", canPersist: false };
  }
}

export function writeNotes(storage: Pick<Storage, "setItem">, notes: Note[]): boolean {
  try { storage.setItem(NOTES_KEY, JSON.stringify(notes)); return true; }
  catch { return false; }
}
