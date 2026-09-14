import { useState, useEffect } from 'react';

export interface MaskSession {
  created: string;
  counter: number;
  mappings: Record<string, string>; // original -> active masked
  reverseMappings?: Record<string, string>; // masked -> original (historical + manual)
  targetPattern?: string;
  notMaskRules?: string[];
}

type Database = Record<string, MaskSession>;

const DB_KEY = 'domain_masker_db';

export function useDomainMaskerStore() {
  const [db, setDb] = useState<Database>({});

  useEffect(() => {
    const stored = localStorage.getItem(DB_KEY);
    if (stored) {
      try {
        // eslint-disable-next-line
        setDb(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse database', e);
      }
    }
  }, []);

  const saveSession = (id: string, session: MaskSession) => {
    setDb((prev) => {
      // Ensure reverse mappings are built if missing
      if (!session.reverseMappings) {
        session.reverseMappings = {};
        Object.entries(session.mappings).forEach(([orig, masked]) => {
          session.reverseMappings![masked] = orig;
        });
      }
      const next = { ...prev, [id]: session };
      localStorage.setItem(DB_KEY, JSON.stringify(next));
      return next;
    });
  };

  const getSession = (id: string): MaskSession => {
    const session = db[id];
    if (session) {
      if (!session.reverseMappings) {
        const newSession = { ...session, reverseMappings: {} as Record<string, string> };
        Object.entries(newSession.mappings).forEach(([orig, masked]) => {
          newSession.reverseMappings![masked] = orig;
        });
        return newSession;
      }
      return session;
    }
    return {
      created: new Date().toISOString(),
      counter: 1,
      mappings: {},
      reverseMappings: {},
    };
  };

  const hasSession = (id: string): boolean => {
    return !!db[id];
  };

  const exportMapping = (id: string) => {
    if (!db[id]) return null;
    return {
      [id]: db[id]
    };
  };

  const addManualMapping = (id: string, original: string, target: string): { success: boolean; error?: string } => {
    let result = { success: true, error: undefined as string | undefined };
    
    setDb((prev) => {
      const session = prev[id] || { created: new Date().toISOString(), counter: 1, mappings: {}, reverseMappings: {} };
      
      const reverseMappings = { ...(session.reverseMappings || {}) };
      if (Object.keys(reverseMappings).length === 0) {
        Object.entries(session.mappings).forEach(([orig, masked]) => {
          reverseMappings[masked] = orig;
        });
      }

      // Validation
      if (reverseMappings[target] && reverseMappings[target] !== original) {
        result = { success: false, error: `Target URL "${target}" is already in use by "${reverseMappings[target]}".` };
        return prev; // abort
      }

      const nextSession = {
        ...session,
        mappings: { ...session.mappings, [original]: target },
        reverseMappings: { ...reverseMappings, [target]: original }
      };

      const next = { ...prev, [id]: nextSession };
      localStorage.setItem(DB_KEY, JSON.stringify(next));
      return next;
    });
    
    return result;
  };

  const clearSession = (id: string) => {
    setDb((prev) => {
      const next = { ...prev };
      delete next[id];
      localStorage.setItem(DB_KEY, JSON.stringify(next));
      return next;
    });
  };

  const removeManualMapping = (id: string, original: string) => {
    setDb((prev) => {
      const session = prev[id];
      if (!session) return prev;
      const target = session.mappings[original];
      const newMappings = { ...session.mappings };
      delete newMappings[original];
      const newReverse = { ...(session.reverseMappings || {}) };
      if (target) {
        delete newReverse[target];
      }
      const nextSession = {
        ...session,
        mappings: newMappings,
        reverseMappings: newReverse,
      };
      const next = { ...prev, [id]: nextSession };
      localStorage.setItem(DB_KEY, JSON.stringify(next));
      return next;
    });
  };

  const importMapping = (data: Database) => {
    setDb((prev) => {
      const next = { ...prev, ...data };
      localStorage.setItem(DB_KEY, JSON.stringify(next));
      return next;
    });
  };

  return { 
    db, 
    getSession, 
    saveSession, 
    hasSession, 
    exportMapping, 
    addManualMapping, 
    removeManualMapping, 
    clearSession, 
    importMapping 
  };
}
