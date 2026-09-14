const fs = require('fs');
let content = fs.readFileSync('app/ClientPage.tsx', 'utf-8');

const oldUseEffect = `  // Load logs when identifier changes
  useEffect(() => {
    const finalIdentifier = identifier.trim().toUpperCase();
    if (!finalIdentifier) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGlobalLogs([]);
      return;
    }
    
    if (store.hasSession(finalIdentifier)) {
      const session = store.getSession(finalIdentifier);
      const loadedLogs: MaskLog[] = Object.entries(session.mappings).map(([orig, masked]) => ({
        file: 'Saved Mapping',
        line: 0,
        original: orig,
        masked: masked
      }));
      setGlobalLogs(loadedLogs.reverse());
    } else {
      setGlobalLogs([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identifier]);`;

const newUseEffect = `  // Safe log hydration to prevent any infinite loops
  const prevIdRef = useRef<string>('');
  useEffect(() => {
    const finalIdentifier = identifier.trim().toUpperCase();
    if (prevIdRef.current === finalIdentifier) return;
    prevIdRef.current = finalIdentifier;
    
    if (!finalIdentifier) {
      setGlobalLogs([]);
      return;
    }
    
    if (store.hasSession(finalIdentifier)) {
      const session = store.getSession(finalIdentifier);
      const loadedLogs: MaskLog[] = Object.entries(session.mappings).map(([orig, masked]) => ({
        file: 'Saved Mapping',
        line: 0,
        original: orig,
        masked: masked
      }));
      setGlobalLogs(loadedLogs.reverse());
    } else {
      setGlobalLogs([]);
    }
  }, [identifier, store]);`;

content = content.replace(oldUseEffect, newUseEffect);
fs.writeFileSync('app/ClientPage.tsx', content);
