'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useDomainMaskerStore } from '@/hooks/use-domain-masker';
import { processText, MaskLog } from '@/lib/domain-masker';
import JSZip from 'jszip';
import { 
  FileText, Upload, Download, Copy, RefreshCw, Archive, FileCode, CheckCircle2, 
  AlertCircle, Trash2, X, Search, Moon, Sun, Plus, Edit3, Wand2, UploadCloud, 
  DownloadCloud, Eraser, ShieldCheck, FileDown, FileUp, RotateCcw, Check,
  ClipboardPaste, ArrowRight, ExternalLink
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ProcessedFile {
  name: string;
  originalText: string;
  processedText: string;
  logs: MaskLog[];
}

const NOT_MASK_STORAGE_KEY = 'domain_masker_not_mask_urls';
// Fallback default presets if no file exists yet (kept to max 6 clean items)
const DEFAULT_NOT_MASK_RULES = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'w3.org',
  'schema.org',
  'github.com',
  'cdnjs.cloudflare.com',
];

// Quick Presets are strictly limited to max 6 popular presets to protect GUI layout
const PRESET_CHIPS = [
  { label: 'Google Fonts', domain: 'fonts.googleapis.com' },
  { label: 'Google Static', domain: 'fonts.gstatic.com' },
  { label: 'W3C', domain: 'w3.org' },
  { label: 'Schema.org', domain: 'schema.org' },
  { label: 'GitHub', domain: 'github.com' },
  { label: 'Cloudflare CDN', domain: 'cdnjs.cloudflare.com' },
];

function loadClientNotMask(): { rules: string[]; input: string } | null {
  if (typeof window === 'undefined') return null;

  // 1. Electron fs check
  try {
    const electronWindow = window as any;
    if (electronWindow.require) {
      const fs = electronWindow.require('fs');
      const pathModule = electronWindow.require('path');
      // Fix: Get real process instead of Next.js dummy process
      const realProcess = electronWindow.require('process');
      const possiblePaths = [
        'not_mask_urls.txt',
        pathModule.join(realProcess.cwd(), 'not_mask_urls.txt'),
        realProcess.resourcesPath ? pathModule.join(realProcess.resourcesPath, 'not_mask_urls.txt') : '',
        pathModule.join(realProcess.cwd(), 'resources', 'not_mask_urls.txt')
      ].filter(Boolean);
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf-8');
          if (content.trim()) {
            const parsed = content
              .split(/\r?\n/)
              .map((s: string) => s.trim())
              .filter((s: string) => s.length > 0 && !s.startsWith('#') && !s.startsWith('//'));
            if (parsed.length > 0) {
              return { rules: parsed, input: content };
            }
          }
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}

export default function Home() {
  const store = useDomainMaskerStore();
  
  const [identifier, setIdentifier] = useState('');
  const [targetPattern, setTargetPattern] = useState('local*.com');
  const [isReverse, setIsReverse] = useState(false);
  const [inputText, setInputText] = useState('');
  const [processedText, setProcessedText] = useState('');
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [globalLogs, setGlobalLogs] = useState<MaskLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Theme & Filter States
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [logFilter, setLogFilter] = useState('');
  
  // Manual Replacements State
  const [manualOriginal, setManualOriginal] = useState('');
  const [manualTarget, setManualTarget] = useState('');
  const [manualSuccess, setManualSuccess] = useState('');
  const [manualError, setManualError] = useState('');

  // NOT MASK URL (Whitelist) State: Initialize with identical server/client default to prevent hydration errors
  const [notMaskRules, setNotMaskRules] = useState<string[]>(DEFAULT_NOT_MASK_RULES);
  const [notMaskInput, setNotMaskInput] = useState<string>(DEFAULT_NOT_MASK_RULES.join('\n'));
  const [notMaskStatus, setNotMaskStatus] = useState('');
  
  const notMaskFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Hydrate NOT MASK rules on client mount safely from server disk or fallback
  const reloadNotMaskFromDisk = async (silent = false) => {
    try {
      // 1. Electron fs direct check
      const clientData = loadClientNotMask();
      if (clientData) {
        setNotMaskRules(clientData.rules);
        setNotMaskInput(clientData.input);
        if (!silent) {
          setNotMaskStatus(`Reloaded ${clientData.rules.length} rules`);
          setTimeout(() => setNotMaskStatus(''), 2500);
        }
        return;
      }

      // 2. Fetch fresh bundled static not_mask_urls.txt directly (cache-busted)
      const res = await fetch(`/not_mask_urls.txt?t=${Date.now()}`);
      if (res.ok) {
        const text = await res.text();
        const parsed = text
          .split(/\r?\n/)
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('#') && !s.startsWith('//'));
        if (parsed.length > 0) {
          setNotMaskRules(parsed);
          setNotMaskInput(text);
          try {
            localStorage.setItem(NOT_MASK_STORAGE_KEY, JSON.stringify(parsed));
          } catch {
            // ignore
          }
          if (!silent) {
            setNotMaskStatus(`Reloaded ${parsed.length} rules from txt`);
            setTimeout(() => setNotMaskStatus(''), 2500);
          }
          return;
        }
      }
    } catch {
      // fallback
    }

    // 3. Fallback to localStorage
    try {
      const saved = localStorage.getItem(NOT_MASK_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setNotMaskRules(parsed);
          setNotMaskInput(parsed.join('\n'));
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      reloadNotMaskFromDisk(true);
    });
  }, []);

  // Sync dark mode class
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // AUTO-SAVE NOT MASK URL
  const saveNotMaskContent = (text: string, parsed: string[]) => {
    try {
      localStorage.setItem(NOT_MASK_STORAGE_KEY, JSON.stringify(parsed));
    } catch {
      // ignore
    }
    try {
      const electronWindow = window as any;
      if (electronWindow.require) {
        const fs = electronWindow.require('fs');
        const pathModule = electronWindow.require('path');
        const realProcess = electronWindow.require('process');
        
        // Try to save to the resourcesPath if it exists (for packed app) or fallback to cwd
        let savePath = 'not_mask_urls.txt';
        if (realProcess.resourcesPath) {
          savePath = pathModule.join(realProcess.resourcesPath, 'not_mask_urls.txt');
        } else if (realProcess.cwd) {
          savePath = pathModule.join(realProcess.cwd(), 'not_mask_urls.txt');
        }
        
        fs.writeFileSync(savePath, text, 'utf-8');
      }
    } catch {
      // ignore
    }
  };

  const handleNotMaskInputChange = (value: string) => {
    setNotMaskInput(value);
    const parsed = value
      .split(/[\r\n,]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('#') && !s.startsWith('//'));
    setNotMaskRules(parsed);
    saveNotMaskContent(value, parsed);
  };

  const handleAddPresetRule = (preset: string) => {
    const clean = preset.trim().toLowerCase();
    if (notMaskRules.includes(clean)) return;
    const nextRules = [...notMaskRules, clean];
    const nextInput = notMaskInput.trim() ? `${notMaskInput.trim()}\n${clean}` : clean;
    setNotMaskRules(nextRules);
    setNotMaskInput(nextInput);
    saveNotMaskContent(nextInput, nextRules);
    setNotMaskStatus(`Added ${preset}`);
    setTimeout(() => setNotMaskStatus(''), 2500);
  };

  const handleDownloadNotMaskFile = () => {
    const header = [
      '# Domain Masker - NOT MASK URL Whitelist',
      '# URLs and domains listed here are NOT masked.',
      '# One domain or URL per line.',
      '# All 3 formats are supported:',
      '#   1. Full URLs:   https://fonts.googleapis.com',
      '#   2. WWW URLs:    www.w3.org',
      '#   3. Plain:       schema.org',
      '# Subdomains are automatically protected.',
      ''
    ].join('\r\n');
    const content = header + notMaskRules.join('\r\n') + '\r\n';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'not_mask_urls.txt';
    a.click();
    URL.revokeObjectURL(url);
    setNotMaskStatus('Saved not_mask_urls.txt');
    setTimeout(() => setNotMaskStatus(''), 3000);
  };

  const handleImportNotMaskFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    try {
      const file = e.target.files[0];
      const text = await file.text();
      let imported: string[] = [];
      if (file.name.endsWith('.json')) {
        const json = JSON.parse(text);
        imported = Array.isArray(json) ? json : Object.keys(json);
      } else {
        imported = text
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));
      }
      const combined = Array.from(new Set([...notMaskRules, ...imported]));
      setNotMaskRules(combined);
      setNotMaskInput(text);
      saveNotMaskContent(text, combined);
      setNotMaskStatus(`Loaded ${imported.length} rules from ${file.name}`);
      setTimeout(() => setNotMaskStatus(''), 3000);
    } catch {
      setError('Could not read the whitelist file.');
    }
    if (notMaskFileInputRef.current) notMaskFileInputRef.current.value = '';
  };

  const handleResetDefaultRules = () => {
    setNotMaskRules(DEFAULT_NOT_MASK_RULES);
    const text = DEFAULT_NOT_MASK_RULES.join('\n');
    setNotMaskInput(text);
    saveNotMaskContent(text, DEFAULT_NOT_MASK_RULES);
    setNotMaskStatus('Reset to standard presets');
    setTimeout(() => setNotMaskStatus(''), 2500);
  };

  // Active manual mappings for current identifier
  const currentActiveSession = useMemo(() => {
    const finalId = identifier.trim().toUpperCase();
    if (!finalId) return null;
    return store.getSession(finalId);
  }, [identifier, store]);

  const activeMappingsList = useMemo(() => {
    if (!currentActiveSession || !currentActiveSession.mappings) return [];
    return Object.entries(currentActiveSession.mappings).map(([orig, target]) => ({
      original: orig,
      target: target,
    }));
  }, [currentActiveSession]);

  // Safe log hydration to prevent any infinite loops
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
  }, [identifier, store]);

  const ID_PREFIX = '--- MASKER_ID: ';
  const LEGACY_ID_PREFIX = '--- DOMAIN_MASKER_ID: ';
  const ID_SUFFIX = ' ---';

  const generateIdentifier = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setIdentifier(result);
  };

  const handleAddManualMapping = () => {
    setManualSuccess('');
    setManualError('');
    const finalIdentifier = identifier.trim().toUpperCase();
    if (!finalIdentifier) {
      setManualError('Please provide an Identifier first.');
      return;
    }
    const orig = manualOriginal.trim().toLowerCase();
    const targ = manualTarget.trim().toLowerCase();
    if (!orig || !targ) {
      setManualError('Both Original Domain and Target Domain are required.');
      return;
    }
    
    const { success, error: err } = store.addManualMapping(finalIdentifier, orig, targ);
    
    if (success) {
      setGlobalLogs(prev => [{
        file: 'Manual Entry',
        line: 0,
        original: orig,
        masked: targ
      }, ...prev]);

      setManualOriginal('');
      setManualTarget('');
      setManualSuccess(`Mapped ${orig} → ${targ}`);
      setTimeout(() => setManualSuccess(''), 3000);
    } else {
      setManualError(err || 'Failed to add manual mapping.');
    }
  };

  const handleRemoveManualMapping = (orig: string) => {
    const finalIdentifier = identifier.trim().toUpperCase();
    if (!finalIdentifier) return;
    store.removeManualMapping(finalIdentifier, orig);
    setGlobalLogs(prev => prev.filter(l => !(l.original === orig && l.file === 'Manual Entry')));
  };

  const detectIdentifier = (text: string) => {
    const firstLine = text.split('\n')[0].trimEnd();
    if (firstLine && firstLine.endsWith(ID_SUFFIX)) {
      if (firstLine.startsWith(ID_PREFIX)) {
        const detectedId = firstLine.substring(ID_PREFIX.length, firstLine.length - ID_SUFFIX.length).trim();
        if (detectedId) {
          setIdentifier(detectedId.toUpperCase());
          setIsReverse(true);
        }
      } else if (firstLine.startsWith(LEGACY_ID_PREFIX)) {
        const detectedId = firstLine.substring(LEGACY_ID_PREFIX.length, firstLine.length - ID_SUFFIX.length).trim();
        if (detectedId) {
          setIdentifier(detectedId.toUpperCase());
          setIsReverse(true);
        }
      }
    }
  };

  const handleInputTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setInputText(text);
    detectIdentifier(text);
  };

  const handlePasteInputText = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputText(text);
        detectIdentifier(text);
      }
    } catch {
      // ignore
    }
  };

  const processInput = () => {
    const finalIdentifier = identifier.trim().toUpperCase();
    if (!finalIdentifier) {
      setError('Please provide an Identifier.');
      return;
    }
    if (!isReverse && !targetPattern.trim()) {
      setError('Please provide a Target Mask pattern.');
      return;
    }
    if (isReverse && !store.hasSession(finalIdentifier)) {
      setError(`No mappings found for identifier "${finalIdentifier}" to reverse.`);
      return;
    }
    setError(null);

    let currentSession = store.getSession(finalIdentifier);
    let allLogs: MaskLog[] = [];
    const updatedFiles: ProcessedFile[] = [];

    if (inputText) {
      const result = processText(inputText, 'Paste Input', currentSession, isReverse, finalIdentifier, targetPattern.trim(), notMaskRules);
      setProcessedText(result.text);
      allLogs = [...allLogs, ...result.logs];
      currentSession = result.session;
    } else {
      setProcessedText('');
    }

    for (const f of files) {
      const result = processText(f.originalText, f.name, currentSession, isReverse, finalIdentifier, targetPattern.trim(), notMaskRules);
      updatedFiles.push({
        ...f,
        processedText: result.text,
        logs: result.logs,
      });
      allLogs = [...allLogs, ...result.logs];
      currentSession = result.session;
    }

    setFiles(updatedFiles);
    setGlobalLogs(prev => [...allLogs, ...prev]);
    store.saveSession(finalIdentifier, currentSession);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const uploadedFiles = Array.from(e.target.files);
    const newFiles: ProcessedFile[] = [];

    for (const file of uploadedFiles) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        try {
          const zip = new JSZip();
          const loadedZip = await zip.loadAsync(file);
          
          for (const [relativePath, zipEntry] of Object.entries(loadedZip.files)) {
            if (zipEntry.dir) continue;
            if (/\.(png|jpg|jpeg|gif|ico|pdf|eot|ttf|woff|woff2)$/i.test(relativePath)) continue;
            
            const text = await zipEntry.async('string');
            detectIdentifier(text);
            newFiles.push({
              name: relativePath,
              originalText: text,
              processedText: '',
              logs: [],
            });
          }
        } catch (err) {
          console.error(`Failed to unzip ${file.name}`, err);
          setError(`Failed to extract contents from ${file.name}`);
        }
      } else {
        const text = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as string || '');
          reader.readAsText(file);
        });
        detectIdentifier(text);
        newFiles.push({
          name: file.name,
          originalText: text,
          processedText: '',
          logs: [],
        });
      }
    }
    
    setFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const copyOutput = async () => {
    if (processedText) {
      await navigator.clipboard.writeText(processedText);
    }
  };

  const downloadOutput = async () => {
    if (files.length === 0 && !processedText) return;

    if (files.length === 1 && !processedText) {
      const blob = new Blob([files[0].processedText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = isReverse ? `unmasked_${files[0].name}` : `masked_${files[0].name}`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const zip = new JSZip();
      if (processedText) {
        zip.file('paste_output.txt', processedText);
      }
      files.forEach(f => {
        zip.file(isReverse ? `unmasked_${f.name}` : `masked_${f.name}`, f.processedText);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = isReverse ? `domain_unmasker_output.zip` : `domain_masker_output.zip`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const downloadMapping = () => {
    const finalIdentifier = identifier.trim().toUpperCase();
    if (!finalIdentifier) return;
    // Save current UI state to session before export
    const currentSession = store.getSession(finalIdentifier);
    store.saveSession(finalIdentifier, {
      ...currentSession,
      targetPattern: targetPattern.trim(),
      notMaskRules: notMaskRules
    });
    const data = store.exportMapping(finalIdentifier);
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapping_${finalIdentifier}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportMapping = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    try {
      const file = e.target.files[0];
      const text = await file.text();
      const json = JSON.parse(text);
      store.importMapping(json);
      const keys = Object.keys(json);
      if (keys.length === 1) {
        const id = keys[0];
        setIdentifier(id);
        const session = json[id];
        if (session.targetPattern) setTargetPattern(session.targetPattern);
        if (session.notMaskRules) {
          setNotMaskRules(session.notMaskRules);
          setNotMaskInput(session.notMaskRules.join('\n'));
        }
      }
      setError(null);
      alert('Mapping imported successfully.');
    } catch {
      setError('Failed to import mapping. Invalid JSON.');
    }
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const clearIdentifierReplacements = () => {
    const finalIdentifier = identifier.trim().toUpperCase();
    if (!finalIdentifier) return;
    if (window.confirm(`Are you sure you want to delete all replacements mapped to identifier "${finalIdentifier}"?`)) {
      store.clearSession(finalIdentifier);
      setGlobalLogs([]);
      setIsReverse(false);
      alert(`Identifier "${finalIdentifier}" cleared.`);
    }
  };

  const hasOutput = processedText.length > 0 || files.some(f => f.processedText.length > 0);
  
  const filteredLogs = globalLogs.filter(log => {
    const search = logFilter.toLowerCase();
    return log.file.toLowerCase().includes(search) || 
           log.original.toLowerCase().includes(search) || 
           log.masked.toLowerCase().includes(search);
  });

  return (
    <div className={cn("min-h-screen flex flex-col font-sans transition-colors duration-200", isDarkMode ? "bg-stone-950 text-stone-100" : "bg-stone-50 text-stone-900")}>
      
      {/* Window Title Bar */}
      <div 
        className="flex items-center justify-between h-8 bg-stone-900 text-stone-300 w-full fixed top-0 left-0 z-50 select-none shadow-sm border-b border-stone-800"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2 pl-4 text-xs font-semibold tracking-wider">
          <Archive className="w-3.5 h-3.5 text-indigo-400" />
          <span>DOMAIN MASKER</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-400 font-normal">v1.2</span>
        </div>
        <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button 
            onClick={() => window.close()} 
            className="h-8 px-4 hover:bg-red-600 hover:text-white transition-colors flex items-center justify-center"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-3 sm:p-5 pt-11 pb-28 max-w-[1720px] mx-auto w-full flex flex-col gap-4">
        
        {/* ======================================================== */}
        {/* TOP BAR: Controls & Settings                             */}
        {/* ======================================================== */}
        <header className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-sm p-4 sm:p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 items-end">
            
            {/* 1. Identifier * */}
            <div className="lg:col-span-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider flex items-center gap-1">
                  <span>Identifier</span>
                  <span className="text-red-500">*</span>
                  {store.hasSession(identifier.trim().toUpperCase()) && (
                    <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 rounded font-normal">
                      Saved
                    </span>
                  )}
                </label>
                <button 
                  onClick={generateIdentifier} 
                  type="button"
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 transition-colors"
                  title="Generate Random Identifier"
                >
                  <Wand2 className="w-3.5 h-3.5" /> Gen
                </button>
              </div>
              <input 
                type="text" 
                placeholder="e.g. M2 or PROD" 
                value={identifier}
                onChange={e => setIdentifier(e.target.value.toUpperCase())}
                className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl px-3.5 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-stone-900 dark:text-white placeholder-stone-400"
              />
            </div>

            {/* 2. Target Mask * */}
            <div className="lg:col-span-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider flex items-center gap-1">
                  <span>Target Mask</span>
                  <span className="text-red-500">*</span>
                </label>
                <span className="text-[10px] text-stone-500 dark:text-stone-400 font-mono">
                  local*.com or local.com
                </span>
              </div>
              <input 
                type="text" 
                placeholder="local*.com or local.com" 
                value={targetPattern}
                disabled={isReverse}
                onChange={e => setTargetPattern(e.target.value.toLowerCase())}
                className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-stone-900 dark:text-white placeholder-stone-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* 3. Mode Toggle */}
            <div className="lg:col-span-3 space-y-1.5">
              <label className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                Mode
              </label>
              <div className="grid grid-cols-2 gap-1.5 bg-stone-100 dark:bg-stone-950 p-1 rounded-xl border border-stone-200 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setIsReverse(false)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all",
                    !isReverse 
                      ? "bg-white dark:bg-stone-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-stone-200 dark:border-stone-700" 
                      : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
                  )}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Masking
                </button>
                <button
                  type="button"
                  onClick={() => setIsReverse(true)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all",
                    isReverse 
                      ? "bg-amber-500 text-white shadow-sm" 
                      : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
                  )}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reverse
                </button>
              </div>
            </div>

            {/* 4. Action Buttons */}
            <div className="lg:col-span-3 flex items-center gap-2">
              <button 
                onClick={downloadMapping}
                disabled={!identifier}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 rounded-xl text-xs font-semibold hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-40 transition-colors"
                title="Export current session mappings as JSON"
              >
                <DownloadCloud className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                Export
              </button>

              <button 
                onClick={() => importInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 rounded-xl text-xs font-semibold hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                title="Import existing session mappings JSON"
              >
                <UploadCloud className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                Import
              </button>
              <input type="file" accept=".json" ref={importInputRef} onChange={handleImportMapping} className="hidden" />

              <button 
                onClick={clearIdentifierReplacements}
                disabled={!identifier}
                className="p-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 rounded-xl transition-colors disabled:opacity-40"
                title="Clear Identifier Mappings"
              >
                <Eraser className="w-4 h-4" />
              </button>

              <button 
                onClick={() => setIsDarkMode(!isDarkMode)} 
                className="p-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 transition-colors"
                title="Toggle Theme"
              >
                {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
              </button>
            </div>

          </div>

          {error && (
            <div className="mt-3 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 p-3 rounded-xl flex items-center justify-between border border-red-200 dark:border-red-900/60 text-xs">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/50 rounded">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </header>

        {/* ======================================================== */}
        {/* MAIN BODY: Left Vertical Sidebar + Right 2x2 Grid        */}
        {/* ======================================================== */}
        <div className="flex flex-col lg:flex-row gap-4 items-start flex-1">
          
          {/* ====================================================== */}
          {/* LEFT VERTICAL SIDEBAR: Manual Replacements & NOT MASK  */}
          {/* ====================================================== */}
          <aside className="w-full lg:w-[380px] flex-shrink-0 flex flex-col gap-4">
            
            {/* 1. Manual Replacements Card */}
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                    <Edit3 className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-bold text-stone-900 dark:text-white">
                    Manual Replacements
                  </h2>
                </div>
                {activeMappingsList.length > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                    {activeMappingsList.length} active
                  </span>
                )}
              </div>

              <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                Manually map a specific domain to a custom target, overriding automatic mask patterns.
              </p>

              {/* Input Form */}
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-1 gap-2">
                  <input 
                    type="text" 
                    placeholder="Original (e.g. youtube.com)" 
                    value={manualOriginal}
                    onChange={e => setManualOriginal(e.target.value.toLowerCase())}
                    className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-stone-900 dark:text-white placeholder-stone-400"
                  />
                  <input 
                    type="text" 
                    placeholder="Custom Target (e.g. local1.com)" 
                    value={manualTarget}
                    onChange={e => setManualTarget(e.target.value.toLowerCase())}
                    className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-stone-900 dark:text-white placeholder-stone-400"
                  />
                </div>

                <button 
                  onClick={handleAddManualMapping}
                  disabled={!manualOriginal || !manualTarget}
                  className="w-full flex items-center justify-center gap-1.5 bg-stone-900 hover:bg-stone-800 text-white dark:bg-indigo-600 dark:hover:bg-indigo-500 px-4 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Mapping
                </button>
              </div>

              {manualSuccess && (
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-lg">
                  {manualSuccess}
                </p>
              )}
              {manualError && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-2 rounded-lg">
                  {manualError}
                </p>
              )}

              {/* Active Mappings List for current Identifier */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Current Identifier Overrides
                </span>
                
                {activeMappingsList.length === 0 ? (
                  <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-950/50 border border-dashed border-stone-200 dark:border-stone-800 text-center">
                    <p className="text-xs text-stone-400 dark:text-stone-500">
                      {identifier ? 'No manual mappings set for this ID.' : 'Enter an Identifier above to manage overrides.'}
                    </p>
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {activeMappingsList.map((item) => (
                      <div 
                        key={item.original}
                        className="flex items-center justify-between p-2 rounded-lg bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-xs font-mono"
                      >
                        <div className="flex items-center gap-1.5 truncate max-w-[280px]">
                          <span className="text-stone-700 dark:text-stone-300 truncate" title={item.original}>
                            {item.original}
                          </span>
                          <ArrowRight className="w-3 h-3 text-stone-400 flex-shrink-0" />
                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold truncate" title={item.target}>
                            {item.target}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveManualMapping(item.original)}
                          className="text-stone-400 hover:text-red-500 dark:hover:text-red-400 p-1 rounded transition-colors"
                          title="Delete Mapping"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 2. NOT MASK URL (Whitelist) Card */}
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-stone-900 dark:text-white">
                      NOT MASK URL
                    </h2>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    {notMaskRules.length} rules
                  </span>
                  <button
                    type="button"
                    onClick={() => reloadNotMaskFromDisk(false)}
                    title="Reload rules directly from not_mask_urls.txt"
                    className="p-1 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
                <span className="font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Auto-saved (not_mask_urls.txt)
                </span>
                {notMaskStatus && (
                  <span className="font-medium text-stone-700 dark:text-stone-300 animate-fade-in">
                    {notMaskStatus}
                  </span>
                )}
              </div>

              <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                URLs/domains listed here remain completely untouched. 1 per line (or comma-separated).
              </p>

              {/* Textarea */}
              <textarea
                value={notMaskInput}
                onChange={e => handleNotMaskInputChange(e.target.value)}
                rows={5}
                placeholder="fonts.googleapis.com&#10;https://www.w3.org&#10;schema.org"
                className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl p-2.5 text-xs font-mono resize-y text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400"
              />

              {/* Quick Presets */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Quick Presets
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_CHIPS.map(preset => {
                    const isAdded = notMaskRules.includes(preset.domain);
                    return (
                      <button
                        key={preset.domain}
                        type="button"
                        onClick={() => handleAddPresetRule(preset.domain)}
                        disabled={isAdded}
                        className={cn(
                          "px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1",
                          isAdded
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 cursor-default"
                            : "bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700"
                        )}
                      >
                        {isAdded ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 text-stone-400" />}
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Buttons: Save as TXT / Load from TXT / Reload from Disk / Reset */}
              <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={handleDownloadNotMaskFile}
                  className="flex items-center justify-center gap-1 py-1.5 px-1 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-lg text-[11px] font-semibold transition-colors"
                  title="Save whitelist as not_mask_urls.txt"
                >
                  <FileDown className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" />
                  Save
                </button>

                <button
                  type="button"
                  onClick={() => notMaskFileInputRef.current?.click()}
                  className="flex items-center justify-center gap-1 py-1.5 px-1 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-lg text-[11px] font-semibold transition-colors"
                  title="Load whitelist from a text file"
                >
                  <FileUp className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" />
                  Load
                </button>
                <input
                  type="file"
                  accept=".txt,.json"
                  ref={notMaskFileInputRef}
                  onChange={handleImportNotMaskFile}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => reloadNotMaskFromDisk(false)}
                  className="flex items-center justify-center gap-1 py-1.5 px-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-lg text-[11px] font-semibold transition-colors border border-emerald-200/60 dark:border-emerald-800/40"
                  title="Reload whitelist directly from not_mask_urls.txt"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  Reload
                </button>

                <button
                  type="button"
                  onClick={handleResetDefaultRules}
                  className="flex items-center justify-center gap-1 py-1.5 px-1 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-400 rounded-lg text-[11px] font-semibold transition-colors"
                  title="Reset to default standard presets"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                  Reset
                </button>
              </div>

            </div>

          </aside>

          {/* ====================================================== */}
          {/* RIGHT AREA: 2x2 KACHELN                                */}
          {/* Row 1: Input Text | Output                             */}
          {/* Row 2: Upload Files                                    */}
          {/* Row 3: Replacement Logs (full width)                   */}
          {/* ====================================================== */}
          <main className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
            
            {/* ---------------------------------------------------- */}
            {/* KACHEL 1 (Top-Left): Input Text                      */}
            {/* ---------------------------------------------------- */}
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 shadow-sm flex flex-col min-h-[340px]">
              <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-2.5 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                    <FileText className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-bold text-stone-900 dark:text-white">
                    Input Text
                  </h2>
                </div>
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={handlePasteInputText}
                    type="button"
                    className="text-xs font-semibold text-stone-600 dark:text-stone-300 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 transition-colors"
                    title="Paste from clipboard"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" /> Paste
                  </button>
                  {inputText && (
                    <button 
                      onClick={() => {
                        setInputText('');
                        setProcessedText('');
                      }} 
                      type="button"
                      className="text-xs font-semibold text-stone-600 dark:text-stone-300 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" /> Clear
                    </button>
                  )}
                </div>
              </div>

              <textarea
                className="flex-1 w-full min-h-[240px] p-3 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl font-mono text-xs leading-relaxed resize-none text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Paste or type text containing domains here... (e.g. Visit https://mysite.com or contact info@company.de)"
                value={inputText}
                onChange={handleInputTextChange}
              />
              
              <div className="mt-2 flex items-center justify-between text-[11px] text-stone-400 dark:text-stone-500">
                <span>{inputText.length} characters</span>
                <span>{inputText ? inputText.split(/\s+/).filter(Boolean).length : 0} words</span>
              </div>
            </div>

            {/* ---------------------------------------------------- */}
            {/* KACHEL 2 (Top-Right): Output                         */}
            {/* ---------------------------------------------------- */}
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 shadow-sm flex flex-col min-h-[340px]">
              <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-2.5 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-bold text-stone-900 dark:text-white">
                    Output
                  </h2>
                </div>
                <div className="flex items-center gap-1.5">
                  {processedText && (
                    <button 
                      onClick={copyOutput} 
                      type="button"
                      className="text-xs font-semibold text-stone-700 dark:text-stone-200 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </button>
                  )}
                  {hasOutput && (
                    <button 
                      onClick={downloadOutput} 
                      type="button"
                      className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </button>
                  )}
                </div>
              </div>

              <textarea
                className="flex-1 w-full min-h-[240px] p-3 bg-stone-50/80 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl font-mono text-xs leading-relaxed resize-none text-stone-800 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-600 focus:outline-none"
                readOnly
                placeholder="Processed (masked or restored) text will appear here after clicking Start Process..."
                value={processedText}
              />

              <div className="mt-2 flex items-center justify-between text-[11px] text-stone-400 dark:text-stone-500">
                <span>{processedText.length} characters</span>
                {processedText && <span className="text-emerald-500 font-medium">Ready</span>}
              </div>
            </div>

            {/* ---------------------------------------------------- */}
            {/* KACHEL 3 (Bottom-Left): Upload Files                 */}
            {/* ---------------------------------------------------- */}
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 shadow-sm flex flex-col min-h-[340px]">
              <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-2.5 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                    <FileCode className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-bold text-stone-900 dark:text-white">
                    Upload Files
                  </h2>
                  {files.length > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                      {files.length}
                    </span>
                  )}
                </div>
                {files.length > 0 && (
                  <button 
                    onClick={() => setFiles([])} 
                    type="button"
                    className="text-xs font-semibold text-stone-600 dark:text-stone-300 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear All
                  </button>
                )}
              </div>

              {/* Upload Drop Area */}
              <div 
                className="border-2 border-dashed border-stone-300 dark:border-stone-700 rounded-xl p-5 text-center bg-stone-50/50 dark:bg-stone-950/50 hover:bg-stone-100 dark:hover:bg-stone-800/60 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-6 h-6 text-stone-400 dark:text-stone-500 mx-auto mb-2" />
                <p className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                  Click or drag files here
                </p>
                <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5">
                  .txt, .json, .csv, .html, .js, .md, .xml or .zip archives
                </p>
                <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
              </div>

              {/* Files List */}
              <div className="flex-1 mt-3 overflow-y-auto max-h-[160px] space-y-1.5 pr-1">
                {files.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center p-4">
                    <p className="text-xs text-stone-400 dark:text-stone-600">No files uploaded yet.</p>
                  </div>
                ) : (
                  files.map((file, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between p-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl text-xs"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <FileCode className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                        <span className="font-mono text-stone-700 dark:text-stone-300 truncate" title={file.name}>
                          {file.name}
                        </span>
                        {file.processedText && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded font-sans font-medium flex-shrink-0">
                            Processed
                          </span>
                        )}
                      </div>
                      <button 
                        onClick={() => removeFile(idx)} 
                        className="p-1 text-stone-400 hover:text-red-500 rounded transition-colors"
                        title="Remove file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

          </main>

        </div>

        {/* ====================================================== */}
        {/* FULL WIDTH: Replacement Logs (ganz unten, volle Breite) */}
        {/* ====================================================== */}
        <div className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 shadow-sm flex flex-col min-h-[400px]">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-2.5 mb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-stone-900 dark:text-white">
                  Replacement Logs
                </h2>
                {globalLogs.length > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                    {filteredLogs.length}
                  </span>
                )}
              </div>

              {globalLogs.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-950 px-2 py-1 rounded-lg border border-stone-200 dark:border-stone-800">
                    <Search className="w-3.5 h-3.5 text-stone-400" />
                    <input 
                      type="text" 
                      placeholder="Search logs..." 
                      value={logFilter}
                      onChange={e => setLogFilter(e.target.value)}
                      className="bg-transparent border-none text-xs w-24 sm:w-32 focus:outline-none text-stone-900 dark:text-white placeholder-stone-400"
                    />
                  </div>
                  <button 
                    onClick={() => setGlobalLogs([])} 
                    type="button"
                    className="text-stone-400 hover:text-red-500 p-1 rounded"
                    title="Clear logs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Logs Table */}
            <div className="flex-1 overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-950">
              {globalLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center p-6 text-center">
                  <p className="text-xs text-stone-400 dark:text-stone-600">No replacements logged yet.</p>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center p-6 text-center">
                  <p className="text-xs text-stone-400 dark:text-stone-600">No logs match filter &quot;{logFilter}&quot;.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs table-fixed">
                  <thead className="bg-stone-100 dark:bg-stone-900/90 sticky top-0 border-b border-stone-200 dark:border-stone-800 font-semibold text-stone-600 dark:text-stone-400">
                    <tr>
                      <th className="px-3 py-2 w-4/12">Original Domain</th>
                      <th className="px-3 py-2 w-4/12">Masked Target</th>
                      <th className="px-3 py-2 w-3/12">Source</th>
                      <th className="px-3 py-2 w-1/12 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200/50 dark:divide-stone-800/60 font-mono">
                    {filteredLogs.map((log, i) => (
                      <tr key={i} className="hover:bg-stone-100/60 dark:hover:bg-stone-900/50 transition-colors">
                        <td className="px-3 py-2 text-stone-700 dark:text-stone-300 truncate" title={log.original}>
                          {log.original}
                        </td>
                        <td className="px-3 py-2 text-indigo-600 dark:text-indigo-400 font-semibold truncate" title={log.masked}>
                          {log.masked}
                        </td>
                        <td className="px-3 py-2 text-stone-400 dark:text-stone-500 truncate" title={log.file}>
                          {log.file}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => {
                              handleAddPresetRule(log.original);
                            }}
                            className="text-stone-400 hover:text-emerald-500 p-1 rounded transition-colors"
                            title="Add to NOT MASK"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>


      {/* ========================================================== */}
      {/* STICKY BOTTOM BAR: Start Process & Status Summary          */}
      {/* ========================================================== */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-stone-950/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 py-3 px-4 sm:px-6 z-40 shadow-lg">
        <div className="max-w-[1720px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-2.5 h-2.5 rounded-full animate-pulse",
              identifier ? "bg-emerald-500" : "bg-amber-500"
            )} />
            <div>
              <p className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                Ready to {isReverse ? 'Reverse (Unmask)' : 'Process (Mask)'}
              </p>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                {files.length} file(s){inputText ? ' + text input' : ''} 
                {!isReverse ? ` • Target: ${targetPattern || 'local*.com'}` : ''}
                {notMaskRules.length > 0 ? ` • ${notMaskRules.length} whitelist rules` : ''}
                {identifier ? ` • ID: ${identifier}` : ' • No Identifier'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={processInput}
            className="w-full sm:w-auto px-8 py-3 bg-stone-900 hover:bg-stone-800 text-white dark:bg-indigo-600 dark:hover:bg-indigo-500 text-sm rounded-xl font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2.5 active:scale-98"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>START {isReverse ? 'REVERSE (UNMASK)' : 'PROCESS (MASK)'}</span>
          </button>

        </div>
      </footer>

    </div>
    </div>
  );
}
