import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { globSync } from 'glob';
import { processText } from './lib/domain-masker';
import type { MaskSession } from './hooks/use-domain-masker';

// Default Whitelist
const DEFAULT_WHITELIST_PATH = path.join(process.cwd(), 'public', 'not_mask_urls.txt');

function getHelp() {
  return `
Domain Masker API
=================
Verwendung: npx tsx masker.ts [Optionen]

Optionen:
  --input, -i       Eingabetext, Dateipfad oder Ordnerpfad (Mehrfach möglich, z.B. -i file1.txt -i file2.txt)
  --stdin           Liest den Eingabetext aus dem Standard Input (Pipe) anstatt von --input
  --output, -o      Zielordner zum Speichern von Dateien (Optional für Einzeldateien/Text)
  --id, -I          Identifier (wird bei Maskierung autogeneriert, wenn nicht angegeben)
  --target, -t      Target Pattern für Maskierung (Standard: local*.com)
  --mode, -m        Modus: "mask" (Standard) oder "unmask" (bzw. reverse)
  --whitelist, -w   Zusätzliche Pfad zur whitelist .txt oder ein direkter String (Komma getrennt)
  --whitelist-json  JSON Array als String mit Whitelist Domains
  --log, -l         Pfad zu einer Log-Datei (z.B. logs.json), wo Replacements gespeichert werden
  --map-import      Pfad zu einer JSON-Datei, aus der Mappings importiert werden sollen
  --map-export      Pfad zu einer JSON-Datei, in die Mappings exportiert werden sollen
  --map-json        Ein manuelles Mapping als JSON-String (Dict)
  --clear-map       Ignoriert jeglichen Map-Import und startet ein frisches Mapping
  --json            Gibt alle Ergebnisse als exaktes JSON-String-Objekt auf stdout aus
  --quiet, -q       Unterdrückt alle Konsolenausgaben außer Fehlern und dem puren Ergebnis-Text
  --print-log, -p   Gibt nach der Verarbeitung eine Tabelle/Liste der Ersetzungen in der Konsole aus
  --abort-on-error  Bricht den Prozess ab, falls eine Datei bei Batch-Processing nicht gelesen werden kann
  --info            Zeigt System-Informationen (z.B. Whitelist-Pfad) und beendet sich
  --help, -h        Zeigt diese Hilfe an
`;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    // If stdin is not piped/redirected and is interactive, it might hang waiting for input.
    // In node, process.stdin.isTTY is true if it's a terminal.
    if (process.stdin.isTTY) {
      console.error("[WARN] --stdin erwartet Input per Pipe (z.B. echo '...' | npx tsx masker.ts --stdin). Beende Input mit Ctrl+D oder Ctrl+C.");
    }
  });
}

async function run() {
  const { values, positionals } = parseArgs({
    options: {
      input: { type: 'string', short: 'i', multiple: true },
      stdin: { type: 'boolean' },
      output: { type: 'string', short: 'o' },
      id: { type: 'string', short: 'I' },
      target: { type: 'string', short: 't', default: 'local*.com' },
      mode: { type: 'string', short: 'm', default: 'mask' },
      whitelist: { type: 'string', short: 'w' },
      'whitelist-json': { type: 'string' },
      log: { type: 'string', short: 'l' },
      'map-import': { type: 'string' },
      'map-export': { type: 'string' },
      'map-json': { type: 'string' },
      'clear-map': { type: 'boolean' },
      json: { type: 'boolean' },
      quiet: { type: 'boolean', short: 'q' },
      'print-log': { type: 'boolean', short: 'p' },
      'abort-on-error': { type: 'boolean' },
      info: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(getHelp());
    process.exit(0);
  }

  if (values.info) {
    console.log(JSON.stringify({
      whitelist_path: DEFAULT_WHITELIST_PATH,
      cwd: process.cwd(),
      default_target: 'local*.com'
    }, null, 2));
    process.exit(0);
  }

  const isJson = values.json === true;
  const isQuiet = values.quiet === true;
  const shouldPrintLog = values['print-log'] === true;
  const abortOnError = values['abort-on-error'] === true;

  // Logger helper
  const logger = {
    info: (...args: any[]) => { if (!isJson && !isQuiet) console.log(...args); },
    warn: (...args: any[]) => { if (!isJson) console.error(...args); },
    error: (...args: any[]) => { if (!isJson) console.error(...args); },
    success: (...args: any[]) => { if (!isJson && !isQuiet) console.log(...args); },
  };

  let inputs: string[] = [];
  if (values.stdin) {
    const stdinContent = await readStdin();
    if (stdinContent) inputs.push(stdinContent);
  } else if (values.input && values.input.length > 0) {
    inputs = values.input;
  } else if (positionals.length > 0) {
    inputs = positionals;
  }

  if (inputs.length === 0) {
    if (isJson) {
      console.log(JSON.stringify({ error: "No input provided" }));
    } else {
      console.error('Fehler: --input oder --stdin muss angegeben werden.');
    }
    process.exit(1);
  }

  const isReverse = values.mode === 'unmask' || values.mode === 'reverse';
  const targetPattern = values.target || 'local*.com';
  let identifier = values.id || '';

  if (!isReverse && !identifier) {
    identifier = uuidv4().split('-')[0];
    logger.info(`[INFO] Kein Identifier angegeben. Generierter Identifier: ${identifier}`);
  }

  // Session Setup
  let session: MaskSession = {
    created: new Date().toISOString(),
    counter: 1,
    mappings: {},
    reverseMappings: {},
    targetPattern,
  };

  if (!values['clear-map'] && values['map-import']) {
    try {
      const data = fs.readFileSync(values['map-import'], 'utf8');
      const imported = JSON.parse(data);
      session = { ...session, ...imported };
      logger.info(`[INFO] Mapping aus ${values['map-import']} importiert.`);
    } catch (e) {
      logger.warn(`[WARN] Konnte Mapping ${values['map-import']} nicht laden:`, e);
      if (abortOnError) process.exit(1);
    }
  }

  if (values['map-json']) {
    try {
      const manualMappings = JSON.parse(values['map-json']);
      session.mappings = { ...session.mappings, ...manualMappings };
      if (!session.reverseMappings) session.reverseMappings = {};
      for (const [k, v] of Object.entries(manualMappings)) {
        session.reverseMappings[v as string] = k;
      }
    } catch (e) {
      logger.warn(`[WARN] Konnte map-json nicht parsen:`, e);
      if (abortOnError) process.exit(1);
    }
  }

  // Whitelist Setup
  let ignoredRules: string[] = [];
  if (fs.existsSync(DEFAULT_WHITELIST_PATH)) {
    const content = fs.readFileSync(DEFAULT_WHITELIST_PATH, 'utf8');
    ignoredRules = content
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('#') && !s.startsWith('//'));
  }

  if (values.whitelist) {
    if (fs.existsSync(values.whitelist)) {
      const content = fs.readFileSync(values.whitelist, 'utf8');
      const addRules = content
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('#') && !s.startsWith('//'));
      ignoredRules.push(...addRules);
    } else {
      const addRules = values.whitelist.split(/[, ]+/).map(s => s.trim()).filter(Boolean);
      ignoredRules.push(...addRules);
    }
  }

  if (values['whitelist-json']) {
    try {
      const parsed = JSON.parse(values['whitelist-json']);
      if (Array.isArray(parsed)) {
        ignoredRules.push(...parsed);
      }
    } catch (e) {
      logger.warn(`[WARN] Konnte whitelist-json nicht parsen:`, e);
      if (abortOnError) process.exit(1);
    }
  }

  ignoredRules = Array.from(new Set(ignoredRules));
  let allLogs: any[] = [];
  let jsonOutputs: any[] = []; 

  for (const input of inputs) {
    // If it's from stdin, treat as RAW TEXT directly
    let isFile = false;
    let isDirectory = false;
    
    if (!values.stdin) {
      try {
        const stat = fs.statSync(input);
        isFile = stat.isFile();
        isDirectory = stat.isDirectory();
      } catch {
        // Raw string
      }
    }

    if (isDirectory) {
      logger.info(`[INFO] Verarbeite Ordner: ${input}`);
      const files = globSync('**/*', { cwd: input, nodir: true, absolute: true });
      
      if (!values.output) {
        logger.error('Fehler: Bei Ordner-Input muss ein Zielordner (--output) angegeben werden!');
        if (abortOnError) process.exit(1);
        continue;
      }

      if (!fs.existsSync(values.output)) {
        fs.mkdirSync(values.output, { recursive: true });
      }

      let processedCount = 0;
      for (const file of files) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          const relativePath = path.relative(input, file);
          const outPath = path.join(values.output, relativePath);
          
          const outDir = path.dirname(outPath);
          if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

          const result = processText(
            content,
            path.basename(file),
            session,
            isReverse,
            identifier,
            targetPattern,
            ignoredRules
          );

          fs.writeFileSync(outPath, result.text, 'utf8');
          session = result.session;
          allLogs.push(...result.logs);
          processedCount++;
          if (isJson) {
             jsonOutputs.push({ file: path.basename(file), text: result.text, logs: result.logs });
          }
        } catch (err) {
          logger.warn(`[WARN] Datei übersprungen (nicht als Text lesbar?): ${file}`);
          if (abortOnError) process.exit(1);
        }
      }
      logger.success(`[SUCCESS] ${processedCount} Dateien verarbeitet und nach ${values.output} gespeichert.`);

    } else if (isFile) {
      logger.info(`[INFO] Verarbeite Datei: ${input}`);
      const content = fs.readFileSync(input, 'utf8');
      const result = processText(
        content,
        path.basename(input),
        session,
        isReverse,
        identifier,
        targetPattern,
        ignoredRules
      );
      session = result.session;
      allLogs.push(...result.logs);
      
      if (isJson) {
         jsonOutputs.push({ file: path.basename(input), text: result.text, logs: result.logs });
      }

      if (values.output) {
        let outPath = values.output;
        try {
          const outStat = fs.statSync(values.output);
          if (outStat.isDirectory()) {
            outPath = path.join(values.output, path.basename(input));
          }
        } catch {
          if (!path.extname(values.output)) {
            fs.mkdirSync(values.output, { recursive: true });
            outPath = path.join(values.output, path.basename(input));
          }
        }
        fs.writeFileSync(outPath, result.text, 'utf8');
        logger.success(`[SUCCESS] Gespeichert unter: ${outPath}`);
      } else {
        if (!isJson) {
          if (!isQuiet) console.log('\n--- OUTPUT START ---\n');
          console.log(result.text);
          if (!isQuiet) console.log('\n--- OUTPUT END ---\n');
        }
      }

    } else {
      // RAW TEXT or STDIN
      if (!values.stdin) logger.info(`[INFO] Verarbeite Text-Input...`);
      const result = processText(
        input,
        'raw-input.txt',
        session,
        isReverse,
        identifier,
        targetPattern,
        ignoredRules
      );
      session = result.session;
      allLogs.push(...result.logs);
      
      if (isJson) {
         jsonOutputs.push({ text: result.text, logs: result.logs });
      }

      if (values.output) {
        if (!fs.existsSync(values.output)) {
          fs.mkdirSync(values.output, { recursive: true });
        }
        const outPath = path.join(values.output, 'output.txt');
        fs.writeFileSync(outPath, result.text, 'utf8');
        logger.success(`[SUCCESS] Gespeichert unter: ${outPath}`);
      } else {
        if (!isJson) {
          if (!isQuiet) console.log('\n--- OUTPUT START ---\n');
          console.log(result.text);
          if (!isQuiet) console.log('\n--- OUTPUT END ---\n');
        }
      }
    }
  }

  // Export Map
  if (values['map-export']) {
    fs.writeFileSync(values['map-export'], JSON.stringify(session, null, 2), 'utf8');
    logger.info(`[INFO] Mapping nach ${values['map-export']} exportiert.`);
  }

  // Logs File
  if (values.log) {
    fs.writeFileSync(values.log, JSON.stringify(allLogs, null, 2), 'utf8');
    logger.info(`[INFO] Logs nach ${values.log} gespeichert (${allLogs.length} Ersetzungen).`);
  }
  
  // Print Log to Console
  if (shouldPrintLog && !isJson) {
    if (allLogs.length > 0) {
      console.log('\n--- REPLACEMENT LOGS ---');
      allLogs.forEach(log => {
        console.log(`[${log.file}:${log.line}] ${log.original} -> ${log.masked}`);
      });
      console.log('------------------------\n');
    } else {
      console.log('\n--- REPLACEMENT LOGS: Keine Ersetzungen vorgenommen ---\n');
    }
  }

  if (isJson) {
    const outputData = jsonOutputs.length === 1 ? jsonOutputs[0] : { results: jsonOutputs };
    const finalOutput = {
      ...outputData,
      session: session,
      identifier: identifier
    };
    console.log(JSON.stringify(finalOutput));
  }
}

run().catch(err => {
  if (process.argv.includes('--json')) {
     console.log(JSON.stringify({ error: err.toString() }));
  } else {
     console.error('Kritischer Fehler:', err);
  }
  process.exit(1);
});
