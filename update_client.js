const fs = require('fs');
let content = fs.readFileSync('app/ClientPage.tsx', 'utf-8');

// 1. Update downloadMapping to include targetPattern and notMaskRules
content = content.replace(
  'const data = store.exportMapping(finalIdentifier);',
  `// Save current UI state to session before export
    const currentSession = store.getSession(finalIdentifier);
    store.saveSession(finalIdentifier, {
      ...currentSession,
      targetPattern: targetPattern.trim(),
      notMaskRules: notMaskRules
    });
    const data = store.exportMapping(finalIdentifier);`
);

// 2. Update handleImportMapping to load identifier and config
content = content.replace(
  'store.importMapping(json);',
  `store.importMapping(json);
      const keys = Object.keys(json);
      if (keys.length === 1) {
        const id = keys[0];
        setIdentifier(id);
        const session = json[id];
        if (session.targetPattern) setTargetPattern(session.targetPattern);
        if (session.notMaskRules) {
          setNotMaskRules(session.notMaskRules);
          setNotMaskInput(session.notMaskRules.join('\\n'));
        }
      }`
);

fs.writeFileSync('app/ClientPage.tsx', content);
