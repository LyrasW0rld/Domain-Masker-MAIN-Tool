# Domain Masker API (Command Line Interface & Python)

With the Domain Masker API, you can utilize all core functions of the tool directly via PowerShell, CMD, or Python. The script is based on Node.js and TypeScript, and processes your text inputs, files, or even entire directories.

## Prerequisites
1. Node.js must be installed (which is required by the project anyway).
2. All dependencies must be installed: run `npm install` in the project directory.

---

## 1. Command Line (PowerShell / CMD)

The easiest way to call the API is via `npx tsx masker.ts` in the root directory of your project:

```bash
npx tsx masker.ts --input <text|file|folder> [Options]
```

### Parameter Overview

| Parameter | Short | Description |
|---|---|---|
| `--input` | `-i` | **(Required)** Text, file path, or folder path to process. Multiple inputs are allowed (e.g., `-i f1.txt -i f2.txt`). |
| `--stdin` | | Reads input text via Standard-Input (Pipe), e.g., `echo "Text" \| npx tsx masker.ts --stdin`. |
| `--output` | `-o` | Output directory. Required if `--input` is a folder. |
| `--id` | `-I` | Masking ID. Automatically generated if omitted (and printed to the terminal). |
| `--target` | `-t` | Target Pattern for masking (Default: `local*.com`). |
| `--mode` | `-m` | Mode: `mask` (Default) or `unmask` / `reverse`. |
| `--whitelist` | `-w` | Path to a custom `.txt` with exceptions OR a comma-separated string of domains. |
| `--log` | `-l` | Path to a `.json` file where all replacements (logs) will be documented. |
| `--map-import` | | Path to a `.json` file with existing mapping (e.g., Manual Overrides). |
| `--map-export` | | Path to a `.json` file where the final mapping will be saved after execution. |
| `--map-json` | | A manual mapping provided directly as a JSON string. |
| `--whitelist-json`| | Whitelist domains provided as a JSON array string. |
| `--clear-map` | | Flag: Ignores imports and starts a clean, fresh mapping. |
| `--json` | | Outputs all results as a structured JSON object to `stdout` (suppresses normal logs). |
| `--quiet` | `-q` | Suppresses all console output, except for errors and the final masked result text. |
| `--print-log` | `-p` | Prints a clean table of all executed replacements (Original -> Masked) to the console at the end. |
| `--abort-on-error`| | Aborts immediately if an error occurs in a file during batch processing. |
| `--info` | | Prints system information (such as the path of the default whitelist) and exits. |

### Test Commands (Examples)

**1. Process simple text (Quiet Mode)**
Outputs only the masked result (`-q`), automatically generates an ID, and uses the default pattern.
```powershell
npx tsx masker.ts -i "Visit us at mydomain.com and test.com" -q
```

**2. Multiline Input via Pipe (stdin)**
Pipe the content of a file directly to the script and receive the result as well as a log table (`-p`).
```powershell
type my_text.txt | npx tsx masker.ts --stdin -p
```

**3. Process an entire folder (Batch Processing)**
Processes all files in `input_folder` recursively and mirrors them in `output_folder`. Also creates a log file.
```powershell
npx tsx masker.ts -i "./input_folder" -o "./output_folder" -l "./logs.json"
```

**4. Provide Custom Mappings directly**
Masks `apple.com` as `pear.local`.
```powershell
npx tsx masker.ts -i "I like apple.com" --map-json '{"apple.com": "pear.local"}'
```

---

## 2. Python Bridge (`python_bridge.py`)

If you want to control the tool via Python, you can import the ready-to-use wrapper `python_bridge.py`. It utilizes the `--json` flag in the background and returns structured Python dictionaries.

### Basic Setup
The bridge is located in the same folder as the script.
```python
from python_bridge import DomainMasker

# Initializes the masker with the default pattern
masker = DomainMasker(target_pattern="dev*.local")
```

### Request System Info
For example, to find the location of the default whitelist:
```python
info = masker.get_info()
print("Whitelist is located at:", info.get("whitelist_path"))
```

### Process Text (with Dictionaries)
You can pass lists as input or whitelist, and use normal dictionaries for manual overrides.
```python
result = masker.process_text(
    text=["Visit google.com", "Or apple.com"], # Single string also works
    manual_mappings={"google.com": "search.local"},
    whitelist=["test.com"]
)

# The result object contains the entire state
print("Masked Text:", result.get("text"))
print("Replacement Logs:")
for log in result.get("logs", []):
    print(f"  - {log['original']} -> {log['masked']}")
```

### Batch Processing (Handling Errors)
```python
# Mask an entire folder and abort immediately if a file is unreadable
result = masker.process_text(
    text="./my_folder",
    output_dir="./my_target_folder",
    abort_on_error=True
)
```
