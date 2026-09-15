# Domain Masker API (Command Line Interface & Python)

Mit der Domain Masker API kannst du alle Kernfunktionen des Tools direkt über PowerShell, CMD oder Python nutzen. Das Skript basiert auf Node.js und TypeScript und verarbeitet deine Eingaben, Dateien oder sogar ganze Ordner.

## Voraussetzungen
1. Node.js muss installiert sein (wird ohnehin vom Projekt vorausgesetzt).
2. Alle Abhängigkeiten installiert: `npm install` im Projektordner.

---

## 1. Kommandozeile (PowerShell / CMD)

Am einfachsten rufst du die CLI über `npx tsx masker.ts` im Root-Verzeichnis deines Projekts auf:

```bash
npx tsx masker.ts --input <text|file|folder> [Optionen]
```

### Übersicht der Parameter

| Parameter | Kurzform | Beschreibung |
|---|---|---|
| `--input` | `-i` | **(Erforderlich)** Zu verarbeitender Text, Dateipfad oder Ordnerpfad. Mehrfachnennung ist erlaubt (z.B. `-i f1.txt -i f2.txt`). |
| `--stdin` | | Liest den Eingabetext via Standard-Input (Pipe), z.B. `echo "Text" \| npx tsx masker.ts --stdin`. |
| `--output` | `-o` | Zielordner. Erforderlich, wenn `--input` ein Ordner ist. |
| `--id` | `-I` | Maskierungs-ID. Wird automatisch generiert, falls weggelassen (und im Terminal ausgegeben). |
| `--target` | `-t` | Target Pattern für das Masking (Standard: `local*.com`). |
| `--mode` | `-m` | Modus: `mask` (Standard) oder `unmask` / `reverse`. |
| `--whitelist` | `-w` | Pfad zu einer eigenen `.txt` mit Ausnahmen ODER komma-separierte Domains als String. |
| `--log` | `-l` | Pfad zu einer `.json` Datei, in der alle Ersetzungen (Logs) dokumentiert werden. |
| `--map-import` | | Pfad zu einer `.json` Datei mit bestehendem Mapping (z.B. Manual Overrides). |
| `--map-export` | | Pfad zu einer `.json` Datei, in der das finale Mapping nach der Ausführung gespeichert wird. |
| `--map-json` | | Ein manuelles Mapping direkt als JSON-String übergeben. |
| `--whitelist-json`| | Whitelist Domains als JSON-Array übergeben. |
| `--clear-map` | | Flag: Ignoriert Imports und startet ein leeres, frisches Mapping. |
| `--json` | | Gibt alle Ergebnisse als strukturiertes JSON-Objekt auf `stdout` aus (unterdrückt normalen Log). |
| `--quiet` | `-q` | Unterdrückt alle Konsolenausgaben, außer den Fehlern und dem maskierten Resultat-Text. |
| `--print-log` | `-p` | Gibt am Ende eine saubere Tabelle aller durchgeführten Ersetzungen (Original -> Maskiert) aus. |
| `--abort-on-error`| | Bricht bei einem Fehler in einer Datei beim Batch-Processing sofort ab. |
| `--info` | | Gibt Systeminfos (wie den Pfad der Whitelist) aus und beendet sich. |

### Test Commands (Beispiele)

**1. Einfachen Text verarbeiten (Quiet Mode)**
Gibt nur das maskierte Resultat aus (`-q`), generiert automatisch eine ID und nutzt das Standard-Pattern.
```powershell
npx tsx masker.ts -i "Besuche uns auf meinedomain.de und test.com" -q
```

**2. Multiline Input via Pipe (stdin)**
Leite den Inhalt einer Datei direkt an das Skript und erhalte das Resultat sowie eine Log-Tabelle (`-p`).
```powershell
type mein_text.txt | npx tsx masker.ts --stdin -p
```

**3. Ordner verarbeiten (Batch-Processing)**
Verarbeitet alle Dateien in `input_folder` rekursiv und spiegelt sie in `output_folder`. Erstellt zudem eine Log-Datei.
```powershell
npx tsx masker.ts -i "./input_folder" -o "./output_folder" -l "./logs.json"
```

**4. Eigene Mappings direkt übergeben**
Maskiert `apple.com` als `birne.local`.
```powershell
npx tsx masker.ts -i "Ich mag apple.com" --map-json '{"apple.com": "birne.local"}'
```

---

## 2. Python Bridge (`python_bridge.py`)

Wenn du das Tool via Python steuern möchtest, kannst du den fertigen Wrapper `python_bridge.py` importieren. Dieser nutzt im Hintergrund den `--json` Flag und liefert dir strukturierte Python Dictionaries zurück.

### Basic Setup
Die Bridge befindet sich im selben Ordner wie das Skript.
```python
from python_bridge import DomainMasker

# Initialisiert den Masker mit dem Standard-Pattern
masker = DomainMasker(target_pattern="dev*.local")
```

### System-Infos abfragen
Zum Beispiel, um den Speicherort der Standard-Whitelist zu finden:
```python
info = masker.get_info()
print("Whitelist liegt unter:", info.get("whitelist_path"))
```

### Text verarbeiten (mit Dictionaries)
Du kannst Listen als Input oder Whitelist übergeben, und normale Dictionaries für manuelle Overrides nutzen.
```python
result = masker.process_text(
    text=["Besuche google.com", "Oder apple.com"], # Auch als einzelner String möglich
    manual_mappings={"google.com": "suche.local"},
    whitelist=["test.com"]
)

# Das Result-Objekt enthält den kompletten State
print("Maskierter Text:", result.get("text"))
print("Ersetzungs-Logs:")
for log in result.get("logs", []):
    print(f"  - {log['original']} -> {log['masked']}")
```

### Batch-Processing (Fehler abfangen)
```python
# Einen ganzen Ordner maskieren und sofort abbrechen, falls eine Datei unlesbar ist
result = masker.process_text(
    text="./mein_ordner",
    output_dir="./mein_zielordner",
    abort_on_error=True
)
```
