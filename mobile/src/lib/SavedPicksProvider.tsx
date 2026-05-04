import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createPickKey,
  createSavedPick,
  exportSavedPicksToFile,
  importSavedPicksFromFile,
  loadSavedPicks,
  persistSavedPicks,
  type ImportedPicksResult,
  type SavedPick,
  type SavedPickGradePatch,
  type SavedPickSourceType,
  type SavedPickStatus,
  type SavePickInput,
} from './savedPicksStorage';

type SavedPicksContextValue = {
  savedPicks: SavedPick[];
  isLoaded: boolean;
  storageError: string | null;
  savePick: (pick: SavePickInput) => SavedPick;
  deletePick: (id: string) => void;
  clearSavedPicks: () => void;
  updatePickGrade: (id: string, grade: SavedPickGradePatch) => void;
  updatePickGrades: (updates: Array<{ id: string; grade: SavedPickGradePatch }>) => void;
  updatePickStatus: (id: string, status: SavedPickStatus) => void;
  updatePickNotes: (id: string, notes: string) => void;
  isSaved: (pick: SavePickInput) => boolean;
  exportPicks: () => Promise<string>;
  importPicks: (fileUri: string, mode: 'merge' | 'replace') => Promise<ImportedPicksResult>;
};

const SavedPicksContext = createContext<SavedPicksContextValue | null>(null);

export function SavedPicksProvider({ children }: { children: ReactNode }) {
  const [savedPicks, setSavedPicks] = useState<SavedPick[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadSavedPicks()
      .then(picks => {
        if (!cancelled) {
          setSavedPicks(picks);
          setStorageError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSavedPicks([]);
          setStorageError('Saved picks could not be loaded. New saves will stay in memory until storage recovers.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    persistSavedPicks(savedPicks).catch(() => {
      setStorageError('Saved picks could not be written to local storage.');
    });
  }, [isLoaded, savedPicks]);

  const value = useMemo<SavedPicksContextValue>(() => ({
    savedPicks,
    isLoaded,
    storageError,
    savePick: pick => {
      const savedPick = createSavedPick(pick);
      const key = createPickKey(savedPick);
      const existing = savedPicks.find(current => createPickKey(current) === key);

      if (existing) {
        return existing;
      }

      setSavedPicks(current => [savedPick, ...current]);
      return savedPick;
    },
    deletePick: id => {
      setSavedPicks(current => current.filter(pick => pick.id !== id));
    },
    clearSavedPicks: () => setSavedPicks([]),
    updatePickGrade: (id, grade) => {
      setSavedPicks(current => current.map(pick => (
        pick.id === id ? { ...pick, ...grade } : pick
      )));
    },
    updatePickGrades: updates => {
      const updateMap = new Map(updates.map(update => [update.id, update.grade]));
      setSavedPicks(current => current.map(pick => {
        const grade = updateMap.get(pick.id);
        return grade ? { ...pick, ...grade } : pick;
      }));
    },
    updatePickStatus: (id, status) => {
      setSavedPicks(current => current.map(pick => (
        pick.id === id ? { ...pick, status } : pick
      )));
    },
    updatePickNotes: (id, notes) => {
      setSavedPicks(current => current.map(pick => (
        pick.id === id ? { ...pick, notes } : pick
      )));
    },
    isSaved: pick => {
      const key = createPickKey(createSavedPick(pick));
      return savedPicks.some(savedPick => createPickKey(savedPick) === key);
    },
    exportPicks: () => exportSavedPicksToFile(savedPicks),
    importPicks: async (fileUri, mode) => {
      const { picks, result } = await importSavedPicksFromFile(fileUri, savedPicks, mode);
      // Replace savedPicks wholesale with the merge/replace result. The
      // existing persistSavedPicks effect picks this up automatically and
      // writes the new ledger to AsyncStorage.
      setSavedPicks(picks);
      return result;
    },
  }), [isLoaded, savedPicks, storageError]);

  return (
    <SavedPicksContext.Provider value={value}>
      {children}
    </SavedPicksContext.Provider>
  );
}

export function useSavedPicks() {
  const context = useContext(SavedPicksContext);

  if (!context) {
    throw new Error('useSavedPicks must be used within SavedPicksProvider');
  }

  return context;
}

export type { SavedPick, SavedPickGradePatch, SavedPickSourceType, SavedPickStatus, SavePickInput };
