import subprocess
import json
import os
from typing import List, Dict, Optional, Union

class DomainMasker:
    def __init__(self, cli_script_path: str = "masker.ts", target_pattern: str = "local*.com"):
        """
        Initialisiert die Python Bridge für den Domain Masker.
        :param cli_script_path: Pfad zum masker.ts Skript (relativ oder absolut)
        :param target_pattern: Standard-Maskierungsmuster (z.B. 'local*.com')
        """
        self.cli_script_path = cli_script_path
        self.target_pattern = target_pattern

    def _run_cli(self, args: List[str]) -> Dict:
        """ Führt die Node.js CLI aus und parst das JSON-Ergebnis. """
        cmd = ["npx", "tsx", self.cli_script_path, "--json"] + args
        
        try:
            # shell=True on Windows is sometimes needed for npx
            result = subprocess.run(
                cmd, 
                capture_output=True, 
                text=True, 
                check=False,
                shell=(os.name == 'nt')
            )
            
            if result.returncode != 0:
                try:
                    err_data = json.loads(result.stdout)
                    raise Exception(f"CLI Error: {err_data.get('error', 'Unknown Error')}")
                except json.JSONDecodeError:
                    raise Exception(f"CLI Error (Code {result.returncode}):\n{result.stderr}\n{result.stdout}")
            
            return json.loads(result.stdout.strip())
            
        except FileNotFoundError:
            raise Exception("Konnte 'npx' nicht finden. Ist Node.js installiert?")

    def get_info(self) -> Dict:
        """
        Ruft System-Informationen vom Tool ab (z.B. Pfad zur Whitelist).
        """
        cmd = ["npx", "tsx", self.cli_script_path, "--info"]
        result = subprocess.run(
            cmd, 
            capture_output=True, 
            text=True, 
            check=False,
            shell=(os.name == 'nt')
        )
        if result.returncode == 0:
            return json.loads(result.stdout.strip())
        return {}

    def process_text(
        self, 
        text: Union[str, List[str]], 
        mode: str = "mask",
        identifier: Optional[str] = None,
        manual_mappings: Optional[Dict[str, str]] = None,
        whitelist: Optional[List[str]] = None,
        output_dir: Optional[str] = None,
        abort_on_error: bool = False
    ) -> Dict:
        """
        Verarbeitet rohen Text oder Dateipfade.
        :param text: Ein String (roher Text oder Dateipfad) oder eine Liste von Dateipfaden.
        :param mode: "mask" oder "unmask"
        :param identifier: Die ID der Session (wird generiert, wenn None)
        :param manual_mappings: Ein Dictionary von { "original.com": "masked.com" }
        :param whitelist: Eine Liste von Domains, die ignoriert werden sollen ["example.com"]
        :param output_dir: Optionaler Zielordner für Dateien
        :param abort_on_error: Bricht bei Batch-Fehlern hart ab
        :return: Ein Dictionary mit den verarbeiteten Texten, Logs und dem State (Session)
        """
        args = []
        
        if isinstance(text, list):
            for t in text:
                args.extend(["-i", t])
        else:
            args.extend(["-i", text])
            
        args.extend(["-m", mode])
        args.extend(["-t", self.target_pattern])
        
        if identifier:
            args.extend(["-I", identifier])
            
        if manual_mappings:
            args.extend(["--map-json", json.dumps(manual_mappings)])
            
        if whitelist:
            args.extend(["--whitelist-json", json.dumps(whitelist)])
            
        if output_dir:
            args.extend(["-o", output_dir])
            
        if abort_on_error:
            args.append("--abort-on-error")
            
        return self._run_cli(args)

# Einfaches Beispiel beim direkten Ausführen
if __name__ == "__main__":
    masker = DomainMasker()
    
    print("Starte Python Bridge Test...")
    
    res = masker.process_text(
        text="Besuche google.com, apple.com und test.com",
        manual_mappings={"google.com": "suche.local"},
        whitelist=["test.com"]
    )
    
    print("\n--- ERGEBNIS ---")
    print("Identifier:", res.get("identifier"))
    print("Maskierter Text:", res.get("text"))
    print("Logs (Ersetzungen):")
    for log in res.get("logs", []):
        print(f"  - {log['original']} -> {log['masked']}")
    print("----------------")
