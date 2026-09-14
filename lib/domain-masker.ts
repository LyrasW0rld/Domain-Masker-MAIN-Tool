import { parse } from 'tldts';
import type { MaskSession } from '@/hooks/use-domain-masker';

export interface MaskLog {
  file: string;
  line: number;
  original: string;
  masked: string;
}

export function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes any URL notation into a clean domain/host string.
 * Supports:
 * 1) https:// or http:// protocols (e.g. https://fonts.googleapis.com/css -> fonts.googleapis.com)
 * 2) www. prefixes (e.g. www.w3.org -> w3.org)
 * 3) Naked / subdomain domains (e.g. fonts.googleapis.com or w3.org)
 */
export function normalizeDomainRule(entry: string): string {
  if (!entry) return '';
  let cleaned = entry.trim().toLowerCase();
  // Remove comment lines starting with # or //
  if (cleaned.startsWith('#') || cleaned.startsWith('//')) return '';
  // Remove protocol
  cleaned = cleaned.replace(/^(?:https?:)?\/\//i, '');
  // Remove path, query, hash
  cleaned = cleaned.split('/')[0].split('?')[0].split('#')[0];
  // Remove port
  cleaned = cleaned.split(':')[0];
  // Remove leading www.
  cleaned = cleaned.replace(/^www\./i, '');
  return cleaned.trim();
}

/**
 * Checks if a candidate URL / domain matches any rule in the NOT MASK list.
 * Covers all 3 notations: full URL (https://), www., and naked domain.
 * Also supports wildcard rules starting with "*." for case-insensitive suffix matching
 * (e.g., "*.id", "*.top", "*.target" will match "cell.id", "node.top", "event.target").
 */
export function isDomainIgnored(
  match: string,
  baseDomain: string | null | undefined,
  hostname: string | null | undefined,
  ignoredRules: string[]
): boolean {
  if (!ignoredRules || ignoredRules.length === 0) return false;

  const cleanMatch = normalizeDomainRule(match);
  const cleanHostname = hostname ? normalizeDomainRule(hostname) : '';
  const cleanBase = baseDomain ? normalizeDomainRule(baseDomain) : '';

  for (const rawRule of ignoredRules) {
    const rule = normalizeDomainRule(rawRule);
    if (!rule) continue;

    // NEW RULE 2: Wildcard-Support in notMaskRules
    // Check if the rule starts with "*." for wildcard suffix matching
    if (rule.startsWith('*.')) {
      const suffix = rule.slice(1); // Remove the leading "*", keep the "."
      // Case-insensitive suffix check using endsWith()
      if (
        cleanMatch.toLowerCase().endsWith(suffix) ||
        (cleanHostname && cleanHostname.toLowerCase().endsWith(suffix)) ||
        (cleanBase && cleanBase.toLowerCase().endsWith(suffix))
      ) {
        return true;
      }
      continue; // Skip other checks for wildcard rules
    }

    // 1. Direct host or base match
    if (cleanMatch === rule || cleanHostname === rule || cleanBase === rule) {
      return true;
    }

    // 2. Subdomain check (e.g. rule is 'w3.org', match is 'www.w3.org' or 'validator.w3.org';
    // or rule is 'googleapis.com', match is 'fonts.googleapis.com')
    if (
      cleanMatch.endsWith('.' + rule) ||
      (cleanHostname && cleanHostname.endsWith('.' + rule))
    ) {
      return true;
    }

    // 3. Exact rule matches the full hostname (e.g. rule is 'fonts.googleapis.com')
    if (rule.endsWith('.' + cleanBase) && (cleanMatch === rule || cleanHostname === rule)) {
      return true;
    }
  }

  return false;
}

export function extractDomainParts(match: string): { baseDomain: string; hostname: string } | null {
  const parsed = parse(match);
  if (parsed.domain) {
    return {
      baseDomain: parsed.domain.toLowerCase(),
      hostname: (parsed.hostname || parsed.domain).toLowerCase()
    };
  }

  // Fallback for custom, unlisted, or local TLDs (e.g. helloworld.df, test.local, dev.internal)
  const clean = match.replace(/^(?:https?:\/\/)?(?:www\.)?/i, '').split('/')[0].split('?')[0].split('#')[0].split(':')[0];
  const parts = clean.split('.');
  if (parts.length >= 2) {
    const sld = parts[parts.length - 2];
    const tld = parts[parts.length - 1];
    if (sld && tld && /^[a-zA-Z0-9-]+$/.test(sld) && /^[a-zA-Z0-9-]+$/.test(tld)) {
      return {
        baseDomain: `${sld}.${tld}`.toLowerCase(),
        hostname: clean.toLowerCase()
      };
    }
  }
  return null;
}

/**
 * Generates the masked target domain name based on the targetPattern and current counter.
 * - If targetPattern has '*', replace '*' with the counter (e.g. local*.com -> local1.com, local2.com)
 * - If targetPattern does not have '*' but has a dot, insert counter before the last dot (e.g. local.com -> local1.com)
 * - Otherwise, append the counter to the end
 */
export function formatTargetDomain(targetPattern: string, counter: number): string {
  const countStr = String(counter);
  const pattern = (targetPattern && targetPattern.trim()) || 'local*.com';
  
  if (pattern.includes('*')) {
    return pattern.replace(/\*/g, countStr);
  }
  
  const lastDot = pattern.lastIndexOf('.');
  if (lastDot > 0) {
    return pattern.slice(0, lastDot) + countStr + pattern.slice(lastDot);
  }
  
  return pattern + countStr;
}

const URL_REGEX = /(?:https?:\/\/|:\/\/|www\.)?[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/gi;
const ID_PREFIX = '--- MASKER_ID: ';
const LEGACY_ID_PREFIX = '--- DOMAIN_MASKER_ID: ';
const ID_SUFFIX = ' ---';

export function processText(
  text: string,
  fileName: string,
  session: MaskSession,
  isReverse: boolean,
  identifier: string,
  targetPattern: string = 'local*.com',
  ignoredRules: string[] = []
): { text: string; logs: MaskLog[]; session: MaskSession } {
  const lines = text.split('\n');
  const logs: MaskLog[] = [];
  
  // Use reverseMappings from session, fallback to deriving it (just in case)
  const reverseMapping = session.reverseMappings && Object.keys(session.reverseMappings).length > 0 
    ? session.reverseMappings 
    : Object.fromEntries(
        Object.entries(session.mappings).map(([k, v]) => [v, k])
      );
  
  if (isReverse) {
    if (
      lines[0] &&
      (lines[0].trimEnd().startsWith(ID_PREFIX) || lines[0].trimEnd().startsWith(LEGACY_ID_PREFIX)) &&
      lines[0].trimEnd().endsWith(ID_SUFFIX)
    ) {
      lines.shift(); // Remove the identifier line
    }
  }

  let newCounter = session.counter || 1;
  const newMappings = { ...session.mappings };

  // Helper to check if a match is likely just a code token, file name, or CSS class
  // rather than a real domain intention.
  const isFalsePositive = (match: string, line: string, baseDomainToCheck: string, hostnameToCheck: string) => {
    // If we are reversing and the domain is in reverse mappings, it's NOT a false positive
    if (isReverse && (reverseMapping[baseDomainToCheck] || reverseMapping[hostnameToCheck])) {
      return false;
    }

    // Step 5: Scoring System (early checks for definite URLs)
    if (/^https?:\/\//i.test(match)) return false;
    
    // NEW RULE 1: Single-Letter-Blocker (Minified Code Filter) & JS Property Blocker
    // If the match has NO explicit prefix (http://, https://, www.), check the label length and suffix
    const hasExplicitPrefix = /^(?:https?:\/\/|www\.)/i.test(match);
    if (!hasExplicitPrefix) {
      const parts = match.toLowerCase().split('.');
      const lastPart = parts[parts.length - 1];
      const jsProperties = new Set(['target', 'top', 'id', 'length', 'name', 'value', 'nodetype', 'style', 'width', 'height', 'left', 'right', 'bottom', 'src', 'href', 'class', 'type']);
      
      if (jsProperties.has(lastPart)) {
        return true;
      }

      const firstDotIndex = match.indexOf('.');
      if (firstDotIndex > 0) {
        const labelBeforeTld = match.slice(0, firstDotIndex);
        // If the label before the dot has only 1 character, it's likely minified code (e.g., "c.id", "x.top")
        if (labelBeforeTld.length === 1) {
          return true;
        }
      }
    }

    // Step 1: Regex with Lookarounds (Context checks)
    const matchIndex = line.indexOf(match);
    if (matchIndex > 0) {
      const charBefore = line[matchIndex - 1];
      if (charBefore === '$' || charBefore === '@') return true;
      if (charBefore === '/') {
        if (matchIndex > 1 && line[matchIndex - 2] === '/') {
          // protocol relative URL, not a false positive
        } else {
           return true;
        }
      }
    }
    
    const matchEndIndex = matchIndex + match.length;
    if (matchEndIndex < line.length) {
      const charAfter = line[matchEndIndex];
      if (charAfter === '(' || charAfter === '=') return true;
    }

    // Step 2: Code-Keyword-Blacklist (The Bouncer)
    const beforeFirstDot = match.split('.')[0]?.toLowerCase();
    const codeKeywords = new Set(['this', 'event', 'window', 'console', 'document', 'sys', 'jquery', 'location', 'browser', 'prototype', 'req', 'request', 'http', 'xmlhttprequest', 'xmlrequest', 'transport', 'attr', 'eval', 'init', 'using', 'old', 'step', 'slice']);
    if (codeKeywords.has(beforeFirstDot)) {
      return true;
    }

    // Step 3: Casing & Chaining-Prüfung
    if (beforeFirstDot && /[A-Z]/.test(beforeFirstDot) && beforeFirstDot !== beforeFirstDot.toUpperCase() && beforeFirstDot !== beforeFirstDot.toLowerCase()) {
      return true; // CamelCase filter
    }
    if ((match.match(/\./g) || []).length > 2 && !/^www\./i.test(match)) {
       return true; // Object chaining filter (more than 2 dots, not starting with www)
    }

    // Phase 4.1: Leerzeichen-Prüfung
    if (/\s/.test(match)) return true;

    // Step 4: TLD-Abgleich via tldts
    const parsed = parse(match);
    if (!parsed.isIcann) {
      return true;
    }

    // Phase 2: Dateiendungs-Blacklist
    const lowerMatch = match.toLowerCase();
    const mediaBlacklist = [
      '.mp4', '.jpg', '.jpeg', '.png', '.gif', '.csv', '.axd', 
      '.js', '.css', '.txt', '.aspx', '.htm', '.html', '.ico', 
      '.xml', '.svg', '.json', '.zip', '.bmp', '.pdf', '.php', 
      '.dat', '.chr', '.dtd', '.eot', '.woff', '.ttf', '.asmx'
    ];
    for (const ext of mediaBlacklist) {
      if (lowerMatch.endsWith(ext)) {
        return true;
      }
    }

    // Step 6: IDN-Validierung
    try {
      new URL(`http://${match}`);
    } catch {
      return true; // Invalid URL
    }

    // Phase 4.2: Längen-Prüfung und Zahlen (Sanity-Check)
    if (beforeFirstDot && !/[a-zA-Z]/.test(beforeFirstDot)) {
      return true;
    }

    return false;
  };

  const processedLines = lines.map((line, index) => {
    return line.replace(URL_REGEX, (match) => {
      const domainInfo = extractDomainParts(match);
      if (!domainInfo) return match;

      const { baseDomain, hostname } = domainInfo;

      if (isFalsePositive(match, line, baseDomain, hostname)) return match;

      // Whitelist check: if domain/URL is in NOT MASK URL list, keep unchanged
      if (!isReverse && isDomainIgnored(match, baseDomain, hostname, ignoredRules)) {
        return match;
      }
      
      if (isReverse) {
        // In reverse mode, check if the parsed domain matches any known masked domain
        const originalDomain = reverseMapping[hostname] || reverseMapping[baseDomain];
        if (originalDomain) {
          const domainToReplace = reverseMapping[hostname] ? hostname : baseDomain;
          const maskedMatch = match.replace(new RegExp(escapeRegExp(domainToReplace) + '$', 'i'), originalDomain);
          if (match !== maskedMatch) {
            logs.push({
              file: fileName,
              line: index + 1,
              original: match, 
              masked: maskedMatch,
            });
          }
          return maskedMatch;
        }
        return match;
      } else {
        let localDomain = newMappings[baseDomain];
        if (!localDomain) {
          localDomain = formatTargetDomain(targetPattern, newCounter);
          newMappings[baseDomain] = localDomain;
          if (!session.reverseMappings) session.reverseMappings = {};
          session.reverseMappings[localDomain] = baseDomain;
          newCounter++;
        }
        const maskedMatch = match.replace(new RegExp(escapeRegExp(baseDomain) + '$', 'i'), localDomain);
        
        if (match !== maskedMatch) {
          logs.push({
            file: fileName,
            line: index + 1,
            original: match, 
            masked: maskedMatch,
          });
        }
        return maskedMatch;
      }
    });
  });

  let finalText = processedLines.join('\n');
  
  if (!isReverse && identifier) {
    finalText = `${ID_PREFIX}${identifier}${ID_SUFFIX}\n` + finalText;
  }

  return {
    text: finalText,
    logs,
    session: {
      ...session,
      counter: newCounter,
      mappings: newMappings,
      targetPattern,
      notMaskRules: ignoredRules,
    },
  };
}
