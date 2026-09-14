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
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
      const res = await fetch(`${basePath}/not_mask_urls.txt?t=${Date.now()}`);
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
    <div className="min-h-screen flex flex-col w-full text-stone-200">
      
      {/* Window Title Bar */}
      <div 
        className="flex items-center justify-between h-10 bg-[#0a0a0a] border-b border-[#222] w-full fixed top-0 left-0 z-50 select-none shadow-md"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2 pl-5">
          <Archive className="w-4 h-4 text-natgeo" />
          <span className="text-xs font-bold tracking-[0.2em] uppercase text-white">DOMAIN MASKER</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-[#1a1a1a] text-stone-400 font-normal border border-[#333]">v1.2</span>
        </div>
        <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button 
            onClick={() => window.close()} 
            className="h-10 px-5 hover:bg-red-600 hover:text-white transition-colors flex items-center justify-center text-stone-400"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-4 sm:p-6 lg:p-8 pt-16 pb-32 w-full mx-auto flex flex-col gap-6">
        
        {/* ======================================================== */}
        {/* TOP BAR: Controls & Settings                             */}
        {/* ======================================================== */}
        <header className="natgeo-card natgeo-card-hover p-5 sm:p-6 lg:p-8">
          <span className="natgeo-kicker">Configuration</span>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 items-end">
            
            {/* 1. Identifier * */}
            <div className="lg:col-span-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-300 uppercase tracking-wider flex items-center gap-1">
                  <span>Identifier</span>
                  <span className="text-natgeo">*</span>
                  {store.hasSession(identifier.trim().toUpperCase()) && (
                    <span className="text-[10px] px-1.5 py-0.2 bg-emerald-900/60 text-emerald-400 border border-emerald-800/50 rounded font-normal">
                      Saved
                    </span>
                  )}
                </label>
                <button 
                  onClick={generateIdentifier} 
                  type="button"
                  className="text-xs font-bold text-natgeo hover:text-natgeo-dark flex items-center gap-1 transition-colors"
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
                className="natgeo-input uppercase font-mono"
              />
            </div>

            {/* 2. Target Mask * */}
            <div className="lg:col-span-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-300 uppercase tracking-wider flex items-center gap-1">
                  <span>Target Mask</span>
                  <span className="text-natgeo">*</span>
                </label>
                <span className="text-[10px] text-stone-500 font-mono">
                  local*.com or local.com
                </span>
              </div>
              <input 
                type="text" 
                placeholder="local*.com or local.com" 
                value={targetPattern}
                disabled={isReverse}
                onChange={e => setTargetPattern(e.target.value.toLowerCase())}
                className="natgeo-input font-mono disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[#111]"
              />
            </div>

            {/* 3. Mode Toggle */}
            <div className="lg:col-span-3 space-y-2">
              <label className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                Mode
              </label>
              <div className="grid grid-cols-2 gap-2 bg-[#0a0a0a] p-1.5 rounded-lg border border-[#333]">
                <button
                  type="button"
                  onClick={() => setIsReverse(false)}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 rounded-md text-xs font-bold transition-all",
                    !isReverse 
                      ? "bg-[#1a1a1a] text-natgeo shadow-md border border-[#444]" 
                      : "text-stone-500 hover:text-stone-200"
                  )}
                >
                  <RefreshCw className="w-4 h-4" />
                  Masking
                </button>
                <button
                  type="button"
                  onClick={() => setIsReverse(true)}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 rounded-md text-xs font-bold transition-all",
                    isReverse 
                      ? "bg-stone-200 text-black shadow-md border border-stone-300" 
                      : "text-stone-500 hover:text-stone-200"
                  )}
                >
                  <RotateCcw className="w-4 h-4" />
                  Reverse
                </button>
              </div>
            </div>

            {/* 4. Action Buttons */}
            <div className="lg:col-span-3 flex items-center gap-3">
              <button 
                onClick={downloadMapping}
                disabled={!identifier}
                className="flex-1 natgeo-button-secondary py-3.5 disabled:opacity-40"
                title="Export current session mappings as JSON"
              >
                <DownloadCloud className="w-4 h-4" /> Export
              </button>

              <button 
                onClick={() => importInputRef.current?.click()}
                className="flex-1 natgeo-button-secondary py-3.5"
                title="Import existing session mappings JSON"
              >
                <UploadCloud className="w-4 h-4" /> Import
              </button>
              <input type="file" accept=".json" ref={importInputRef} onChange={handleImportMapping} className="hidden" />

              <button 
                onClick={clearIdentifierReplacements}
                disabled={!identifier}
                className="p-3.5 bg-red-950/40 hover:bg-red-900/60 border border-red-900/60 text-red-500 rounded-lg transition-colors disabled:opacity-40"
                title="Clear Identifier Mappings"
              >
                <Eraser className="w-4 h-4" />
              </button>
            </div>

          </div>

          {error && (
            <div className="mt-4 bg-red-950/60 text-red-400 p-4 rounded-lg flex items-center justify-between border border-red-900/60 text-sm font-medium">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="p-1.5 hover:bg-red-900/50 rounded-md">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </header>

        {/* ======================================================== */}
        {/* MAIN BODY: Grid Layout for maximum width utilization     */}
        {/* ======================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
          
          {/* ====================================================== */}
          {/* LEFT SIDEBAR (Span 3 or 4)                             */}
          {/* ====================================================== */}
          <aside className="lg:col-span-4 xl:col-span-3 flex flex-col gap-6">
            
            {/* 1. Manual Replacements Card */}
            <div className="natgeo-card natgeo-card-hover p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#222] pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#1a1a1a] text-natgeo">
                    <Edit3 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="natgeo-kicker">Overrides</span>
                    <h2 className="natgeo-title text-base">Manual Mappings</h2>
                  </div>
                </div>
                {activeMappingsList.length > 0 && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-[#1a1a1a] text-natgeo border border-[#333]">
                    {activeMappingsList.length} Active
                  </span>
                )}
              </div>

              <p className="text-xs text-stone-400 leading-relaxed font-sans">
                Manually map a specific domain to a custom target.
              </p>

              {/* Input Form */}
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-1 gap-3">
                  <input 
                    type="text" 
                    placeholder="Original (e.g. youtube.com)" 
                    value={manualOriginal}
                    onChange={e => setManualOriginal(e.target.value.toLowerCase())}
                    className="natgeo-input py-2.5 text-xs font-mono"
                  />
                  <input 
                    type="text" 
                    placeholder="Custom Target (e.g. local1.com)" 
                    value={manualTarget}
                    onChange={e => setManualTarget(e.target.value.toLowerCase())}
                    className="natgeo-input py-2.5 text-xs font-mono"
                  />
                </div>

                <button 
                  onClick={handleAddManualMapping}
                  disabled={!manualOriginal || !manualTarget}
                  className="w-full natgeo-button py-2.5 disabled:opacity-50 disabled:grayscale"
                >
                  <Plus className="w-4 h-4" /> Add Mapping
                </button>
              </div>

              {manualSuccess && (
                <p className="text-xs font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-900/50 p-2.5 rounded-lg">
                  {manualSuccess}
                </p>
              )}
              {manualError && (
                <p className="text-xs font-bold text-red-400 bg-red-950/40 border border-red-900/50 p-2.5 rounded-lg">
                  {manualError}
                </p>
              )}

              {/* Active Mappings List */}
              <div className="space-y-2 pt-2 border-t border-[#222]">
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
                  Current Overrides
                </span>
                
                {activeMappingsList.length === 0 ? (
                  <div className="p-4 rounded-lg bg-[#0a0a0a] border border-[#222] border-dashed text-center">
                    <p className="text-xs text-stone-500">
                      {identifier ? 'No manual mappings set.' : 'Enter an Identifier first.'}
                    </p>
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {activeMappingsList.map((item) => (
                      <div 
                        key={item.original}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-[#111] border border-[#222] text-xs font-mono"
                      >
                        <div className="flex items-center gap-2 truncate pr-2">
                          <span className="text-stone-300 truncate" title={item.original}>
                            {item.original}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" />
                          <span className="text-natgeo font-bold truncate" title={item.target}>
                            {item.target}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveManualMapping(item.original)}
                          className="text-stone-500 hover:text-red-500 p-1.5 rounded transition-colors bg-[#1a1a1a] hover:bg-[#222]"
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
            <div className="natgeo-card natgeo-card-hover p-5 space-y-4 flex-1 flex flex-col">
              <div className="flex items-center justify-between border-b border-[#222] pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#1a1a1a] text-emerald-400">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="natgeo-kicker">Whitelist</span>
                    <h2 className="natgeo-title text-base">NOT MASK URL</h2>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-[#1a1a1a] text-emerald-400 border border-[#333]">
                    {notMaskRules.length} rules
                  </span>
                  <button
                    type="button"
                    onClick={() => reloadNotMaskFromDisk(false)}
                    title="Reload from disk"
                    className="p-1.5 hover:bg-[#1a1a1a] rounded-md text-emerald-500 transition-colors border border-transparent hover:border-[#333]"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-stone-400">
                <span className="font-mono text-emerald-500 flex items-center gap-1.5 font-bold">
                  <Check className="w-3.5 h-3.5" /> Auto-saved (not_mask_urls.txt)
                </span>
                {notMaskStatus && (
                  <span className="font-bold text-natgeo animate-fade-in">
                    {notMaskStatus}
                  </span>
                )}
              </div>

              <p className="text-xs text-stone-400 leading-relaxed font-sans">
                URLs/domains listed here remain completely untouched.
              </p>

              {/* Textarea */}
              <textarea
                value={notMaskInput}
                onChange={e => handleNotMaskInputChange(e.target.value)}
                rows={6}
                placeholder="fonts.googleapis.com&#10;https://www.w3.org"
                className="flex-1 min-h-[140px] natgeo-textarea text-xs font-mono"
              />

              {/* Quick Presets */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
                  Quick Presets
                </span>
                <div className="flex flex-wrap gap-2">
                  {PRESET_CHIPS.map(preset => {
                    const isAdded = notMaskRules.includes(preset.domain);
                    return (
                      <button
                        key={preset.domain}
                        type="button"
                        onClick={() => handleAddPresetRule(preset.domain)}
                        disabled={isAdded}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors flex items-center gap-1 border",
                          isAdded
                            ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/60 cursor-default"
                            : "bg-[#111] hover:bg-[#1a1a1a] text-stone-300 border-[#333] hover:border-[#444]"
                        )}
                      >
                        {isAdded ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 text-stone-400" />}
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-4 gap-2 pt-3 border-t border-[#222]">
                <button
                  type="button"
                  onClick={handleDownloadNotMaskFile}
                  className="flex flex-col items-center justify-center gap-1 py-2 px-1 bg-[#111] hover:bg-[#1a1a1a] text-stone-300 rounded-lg text-[10px] font-bold transition-colors border border-[#222] hover:border-[#444]"
                  title="Save as TXT"
                >
                  <FileDown className="w-4 h-4 text-stone-400" /> Save
                </button>

                <button
                  type="button"
                  onClick={() => notMaskFileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-1 py-2 px-1 bg-[#111] hover:bg-[#1a1a1a] text-stone-300 rounded-lg text-[10px] font-bold transition-colors border border-[#222] hover:border-[#444]"
                  title="Load from TXT"
                >
                  <FileUp className="w-4 h-4 text-stone-400" /> Load
                </button>
                <input type="file" accept=".txt,.json" ref={notMaskFileInputRef} onChange={handleImportNotMaskFile} className="hidden" />

                <button
                  type="button"
                  onClick={() => reloadNotMaskFromDisk(false)}
                  className="flex flex-col items-center justify-center gap-1 py-2 px-1 bg-emerald-950/30 hover:bg-emerald-900/50 text-emerald-400 rounded-lg text-[10px] font-bold transition-colors border border-emerald-900/50"
                  title="Reload from Disk"
                >
                  <RefreshCw className="w-4 h-4" /> Reload
                </button>

                <button
                  type="button"
                  onClick={handleResetDefaultRules}
                  className="flex flex-col items-center justify-center gap-1 py-2 px-1 bg-[#111] hover:bg-[#1a1a1a] text-stone-400 hover:text-stone-200 rounded-lg text-[10px] font-bold transition-colors border border-[#222] hover:border-[#444]"
                  title="Reset Presets"
                >
                  <RotateCcw className="w-4 h-4 text-stone-500" /> Reset
                </button>
              </div>
            </div>

          </aside>

          {/* ====================================================== */}
          {/* RIGHT AREA: Input, Output, Upload (Span 8 or 9)        */}
          {/* ====================================================== */}
          <main className="lg:col-span-8 xl:col-span-9 grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">
            
            {/* Input Text */}
            <div className="natgeo-card natgeo-card-hover p-5 sm:p-6 flex flex-col xl:col-span-1 min-h-[420px]">
              <div className="flex items-center justify-between border-b border-[#222] pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#1a1a1a] text-natgeo">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="natgeo-kicker">Source</span>
                    <h2 className="natgeo-title">Input Text</h2>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handlePasteInputText}
                    type="button"
                    className="text-xs font-bold text-stone-300 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333] hover:border-[#444] transition-colors"
                  >
                    <ClipboardPaste className="w-4 h-4 text-natgeo" /> Paste
                  </button>
                  {inputText && (
                    <button 
                      onClick={() => {
                        setInputText('');
                        setProcessedText('');
                      }} 
                      type="button"
                      className="text-xs font-bold text-stone-400 hover:text-red-400 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333] hover:border-red-900/50 transition-colors"
                    >
                      <X className="w-4 h-4" /> Clear
                    </button>
                  )}
                </div>
              </div>

              <textarea
                className="flex-1 w-full min-h-[280px] natgeo-textarea"
                placeholder="Paste or type text containing domains here...&#10;(e.g. Visit https://mysite.com or contact info@company.de)"
                value={inputText}
                onChange={handleInputTextChange}
                onFocus={(e) => {
                  const overlay = document.getElementById('focus-overlay');
                  if(overlay) overlay.classList.remove('hidden');
                  e.target.classList.add('relative', 'z-50');
                }}
                onBlur={(e) => {
                  const overlay = document.getElementById('focus-overlay');
                  if(overlay) overlay.classList.add('hidden');
                  e.target.classList.remove('relative', 'z-50');
                }}
              />
              
              <div className="mt-4 flex items-center justify-between text-[11px] font-bold text-stone-500 uppercase tracking-widest">
                <span>{inputText.length} chars</span>
                <span>{inputText ? inputText.split(/\s+/).filter(Boolean).length : 0} words</span>
              </div>
            </div>

            {/* Output */}
            <div className="natgeo-card natgeo-card-hover p-5 sm:p-6 flex flex-col xl:col-span-1 min-h-[420px]">
              <div className="flex items-center justify-between border-b border-[#222] pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#1a1a1a] text-natgeo">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="natgeo-kicker">Result</span>
                    <h2 className="natgeo-title">Output Text</h2>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {processedText && (
                    <button 
                      onClick={copyOutput} 
                      type="button"
                      className="text-xs font-bold text-stone-300 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333] hover:border-[#444] transition-colors"
                    >
                      <Copy className="w-4 h-4 text-natgeo" /> Copy
                    </button>
                  )}
                  {hasOutput && (
                    <button 
                      onClick={downloadOutput} 
                      type="button"
                      className="text-xs font-bold text-black bg-natgeo hover:bg-[#e6b800] flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors shadow-md"
                    >
                      <Download className="w-4 h-4" /> Download
                    </button>
                  )}
                </div>
              </div>

              <textarea
                className="flex-1 w-full min-h-[280px] natgeo-textarea border-dashed border-[#444] bg-[#050505] focus:border-dashed"
                readOnly
                placeholder="Processed (masked or restored) text will appear here..."
                value={processedText}
                onFocus={(e) => {
                  const overlay = document.getElementById('focus-overlay');
                  if(overlay) overlay.classList.remove('hidden');
                  e.target.classList.add('relative', 'z-50');
                }}
                onBlur={(e) => {
                  const overlay = document.getElementById('focus-overlay');
                  if(overlay) overlay.classList.add('hidden');
                  e.target.classList.remove('relative', 'z-50');
                }}
              />

              <div className="mt-4 flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-stone-500">
                <span>{processedText.length} chars</span>
                {processedText && <span className="text-natgeo">Ready</span>}
              </div>
            </div>

            {/* Upload Files */}
            <div className="natgeo-card natgeo-card-hover p-5 sm:p-6 flex flex-col xl:col-span-2">
              <div className="flex items-center justify-between border-b border-[#222] pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#1a1a1a] text-natgeo">
                    <FileCode className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="natgeo-kicker">Batch Processing</span>
                    <h2 className="natgeo-title">Upload Files</h2>
                  </div>
                  {files.length > 0 && (
                    <span className="ml-2 text-[11px] font-bold px-2.5 py-1 rounded-md bg-[#1a1a1a] text-natgeo border border-[#333]">
                      {files.length}
                    </span>
                  )}
                </div>
                {files.length > 0 && (
                  <button 
                    onClick={() => setFiles([])} 
                    type="button"
                    className="text-xs font-bold text-stone-400 hover:text-red-400 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333] hover:border-red-900/50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Clear All
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Upload Drop Area */}
                <div 
                  className="md:col-span-1 border-2 border-dashed border-[#444] rounded-xl p-8 text-center bg-[#0a0a0a] hover:bg-[#111] hover:border-natgeo transition-all cursor-pointer flex flex-col items-center justify-center min-h-[160px] group"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="p-3 bg-[#1a1a1a] rounded-full group-hover:bg-natgeo group-hover:text-black transition-colors mb-3">
                    <Upload className="w-6 h-6 text-stone-400 group-hover:text-black" />
                  </div>
                  <p className="text-sm font-bold text-stone-300 group-hover:text-white">
                    Click or drag files
                  </p>
                  <p className="text-[11px] text-stone-500 font-mono mt-2">
                    .txt, .json, .csv, .html, .js, .zip
                  </p>
                  <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                </div>

                {/* Files List */}
                <div className="md:col-span-2 overflow-y-auto max-h-[220px] space-y-2 pr-2 custom-scrollbar border border-[#222] bg-[#0a0a0a] rounded-xl p-3">
                  {files.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center p-6">
                      <p className="text-sm text-stone-500 font-bold tracking-wide">No files uploaded.</p>
                    </div>
                  ) : (
                    files.map((file, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between p-3.5 bg-[#111] border border-[#222] rounded-lg text-sm transition-colors hover:bg-[#1a1a1a]"
                      >
                        <div className="flex items-center gap-3 truncate pr-4">
                          <FileCode className="w-4 h-4 text-stone-400 flex-shrink-0" />
                          <span className="font-mono text-stone-200 font-medium truncate" title={file.name}>
                            {file.name}
                          </span>
                          {file.processedText && (
                            <span className="text-[10px] px-2 py-0.5 bg-emerald-950/60 text-emerald-400 border border-emerald-900/60 rounded font-sans font-bold uppercase tracking-wider flex-shrink-0">
                              Processed
                            </span>
                          )}
                        </div>
                        <button 
                          onClick={() => removeFile(idx)} 
                          className="p-1.5 text-stone-500 hover:text-red-500 rounded bg-[#1a1a1a] hover:bg-[#222] transition-colors"
                          title="Remove file"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

          </main>
        </div>

        {/* ====================================================== */}
        {/* FULL WIDTH BOTTOM: Replacement Logs                    */}
        {/* ====================================================== */}
        <div className="natgeo-card w-full flex flex-col p-5 sm:p-6 lg:p-8 mt-2 min-h-[400px]">
          <div className="flex items-center justify-between border-b border-[#222] pb-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#1a1a1a] text-natgeo">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <span className="natgeo-kicker">Activity</span>
                <h2 className="natgeo-title">Replacement Logs</h2>
              </div>
              {globalLogs.length > 0 && (
                <span className="ml-2 text-[11px] font-bold px-2.5 py-1 rounded-md bg-[#1a1a1a] text-natgeo border border-[#333]">
                  {filteredLogs.length}
                </span>
              )}
            </div>

            {globalLogs.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-[#0a0a0a] px-3 py-2 rounded-lg border border-[#333]">
                  <Search className="w-4 h-4 text-stone-500" />
                  <input 
                    type="text" 
                    placeholder="Search logs..." 
                    value={logFilter}
                    onChange={e => setLogFilter(e.target.value)}
                    className="bg-transparent border-none text-sm w-32 sm:w-48 focus:outline-none text-white placeholder-stone-600 font-mono"
                  />
                </div>
                <button 
                  onClick={() => setGlobalLogs([])} 
                  type="button"
                  className="text-stone-400 hover:text-red-400 p-2.5 rounded-lg bg-[#1a1a1a] hover:bg-red-950/40 border border-[#333] hover:border-red-900/50 transition-colors"
                  title="Clear logs"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Logs Table */}
          <div className="flex-1 overflow-y-auto rounded-xl border border-[#222] bg-[#0a0a0a]">
            {globalLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center p-12 text-center">
                <p className="text-sm font-bold text-stone-600 uppercase tracking-widest">No replacements logged yet.</p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center p-12 text-center">
                <p className="text-sm font-bold text-stone-600 uppercase tracking-widest">No logs match filter &quot;{logFilter}&quot;.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm table-fixed">
                <thead className="bg-[#111] sticky top-0 border-b border-[#222] font-bold text-stone-400 uppercase tracking-wider text-xs">
                  <tr>
                    <th className="px-5 py-4 w-4/12">Original Domain</th>
                    <th className="px-5 py-4 w-4/12">Masked Target</th>
                    <th className="px-5 py-4 w-3/12">Source</th>
                    <th className="px-5 py-4 w-1/12 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222] font-mono text-xs">
                  {filteredLogs.map((log, i) => (
                    <tr key={i} className="hover:bg-[#1a1a1a] transition-colors group">
                      <td className="px-5 py-3.5 text-stone-300 truncate" title={log.original}>
                        {log.original}
                      </td>
                      <td className="px-5 py-3.5 text-natgeo font-bold truncate" title={log.masked}>
                        {log.masked}
                      </td>
                      <td className="px-5 py-3.5 text-stone-500 truncate" title={log.file}>
                        {log.file}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => {
                            handleAddPresetRule(log.original);
                          }}
                          className="text-stone-500 hover:text-emerald-400 p-2 rounded-lg bg-[#111] group-hover:bg-[#222] transition-colors border border-transparent hover:border-[#444]"
                          title="Add to NOT MASK"
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>

      {/* ========================================================== */}
      {/* STICKY BOTTOM BAR: Start Process & Status Summary          */}
      {/* ========================================================== */}
      <footer className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-xl border-t border-[#333] py-4 px-5 sm:px-8 z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <div className="w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-3 h-3 rounded-full animate-pulse shadow-[0_0_10px_currentColor]",
              identifier ? "bg-emerald-400 text-emerald-400" : "bg-natgeo text-natgeo"
            )} />
            <div>
              <p className="text-sm font-bold text-white tracking-wide">
                Ready to {isReverse ? 'REVERSE (Unmask)' : 'PROCESS (Mask)'}
              </p>
              <p className="text-xs font-mono text-stone-400 mt-0.5">
                {files.length} file(s){inputText ? ' + text input' : ''} 
                {!isReverse ? ` • Target: ${targetPattern || 'local*.com'}` : ''}
                {notMaskRules.length > 0 ? ` • ${notMaskRules.length} whitelist rules` : ''}
                <span className={identifier ? "text-emerald-400 font-bold" : "text-natgeo"}>
                  {identifier ? ` • ID: ${identifier}` : ' • No Identifier'}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={processInput}
            className="w-full sm:w-auto px-10 py-4 natgeo-button text-sm"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>START {isReverse ? 'REVERSE' : 'PROCESS'}</span>
          </button>
        </div>
      </footer>

      {/* Hidden Focus Overlay Backdrop */}
      <div id="focus-overlay" className="focus-overlay hidden"></div>

    </div>
  );
}
