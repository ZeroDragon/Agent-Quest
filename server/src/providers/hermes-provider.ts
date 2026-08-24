// server/src/providers/hermes-provider.ts
import { join } from 'node:path';
import { homedir } from 'node:os';
import { stat } from 'node:fs/promises';

import { SqliteWatcher } from '../watchers/sqlite-watcher';
import { parseHermesMessages } from '../parsers/hermes-parser';
import type { ParsedEvent } from '../parsers/session-parser';
import type { AgentSource } from '../types';
import type { ProviderHandlers, SessionProvider } from './types';

export interface HermesProviderOptions {
  /** Custom path to Hermes home directory. Default ~/.hermes */
  hermesRoot?: string;
  /** How often to poll SQLite. Default 3000ms. */
  scanIntervalMs?: number;
  /** Only consider sessions active within this window (seconds). Default 300. */
  activeWindowSec?: number;
}

export class HermesProvider implements SessionProvider {
  readonly source: AgentSource = 'hermes';

  private readonly hermesRoot: string;
  private readonly scanIntervalMs: number;
  private readonly activeWindowSec: number;
  private watcher: SqliteWatcher | null = null;
  private rootExists = false;

  constructor(opts: HermesProviderOptions = {}) {
    this.hermesRoot = opts.hermesRoot ?? join(homedir(), '.hermes');
    this.scanIntervalMs = opts.scanIntervalMs ?? 3000;
    this.activeWindowSec = opts.activeWindowSec ?? 300;
  }

  async start(handlers: ProviderHandlers): Promise<void> {
    // Check if Hermes is installed
    const rootStat = await stat(this.hermesRoot).catch(() => null);
    if (rootStat === null || !rootStat.isDirectory()) {
      console.log(`[HermesProvider] ${this.hermesRoot} not found — provider inactive`);
      return;
    }

    // Check if state.db exists
    const dbPath = join(this.hermesRoot, 'state.db');
    const dbStat = await stat(dbPath).catch(() => null);
    if (dbStat === null) {
      console.log(`[HermesProvider] state.db not found — provider inactive`);
      return;
    }

    this.rootExists = true;

    // Store session models for name resolution
    const sessionModels = new Map<string, string>();

    this.watcher = new SqliteWatcher(
      {
        onSessionStart: (sessionId, source, cwd, model) => {
          console.log(`[HermesProvider] new session: ${sessionId} (${source}, ${cwd ?? 'unknown'}, model: ${model ?? 'unknown'})`);
          if (model) sessionModels.set(sessionId, model);
          // We'll load initial events on first update
        },
        onSessionUpdate: (sessionId, newMessages) => {
          const events = parseHermesMessages(newMessages);
          if (events.length === 0) return;

          // Check if this is a new session we haven't seen
          const isNew = !this.knownSessions.has(sessionId);
          if (isNew) {
            this.knownSessions.add(sessionId);
            // Use model as name if available, otherwise derive from session id
            const model = sessionModels.get(sessionId);
            const nameOverride = model ? this.formatModelName(model) : undefined;
            
            // For new sessions, we need to emit a session start with events
            handlers.onSessionStart({
              source: this.source,
              sessionId,
              configDir: this.hermesRoot,
              events,
              nameOverride,
            });
          } else {
            handlers.onSessionEvents({
              source: this.source,
              sessionId,
              configDir: this.hermesRoot,
              events,
            });
          }
        },
      },
      {
        scanIntervalMs: this.scanIntervalMs,
        activeWindowSec: this.activeWindowSec,
        dbPath,
      }
    );

    const started = await this.watcher.start();
    if (!started) {
      console.log(`[HermesProvider] failed to start SQLite watcher`);
      return;
    }

    console.log(`[HermesProvider] watching ${dbPath} every ${this.scanIntervalMs}ms`);
  }

  stop(): void {
    this.watcher?.stop();
    this.watcher = null;
  }

  getConfigDirs(): readonly string[] {
    return this.rootExists ? [this.hermesRoot] : [];
  }

  /**
   * Format model name for display as hero name.
   * e.g. "claude-sonnet-4-20250514" -> "Sonnet 4"
   *      "deepseek-v4-flash" -> "DeepSeek Flash"
   *      "gpt-4o" -> "GPT-4o"
   */
  private formatModelName(model: string): string {
    // Common model name mappings
    const modelDisplayNames: Record<string, string> = {
      // Anthropic
      'claude-opus-4-6': 'Opus 4',
      'claude-sonnet-4-20250514': 'Sonnet 4',
      'claude-3-5-sonnet-20241022': 'Sonnet 3.5',
      'claude-3-5-haiku-20241022': 'Haiku 3.5',
      // OpenAI
      'gpt-4o': 'GPT-4o',
      'gpt-4o-mini': 'GPT-4o Mini',
      'gpt-4-turbo': 'GPT-4 Turbo',
      'o1': 'O1',
      'o1-mini': 'O1 Mini',
      'o3-mini': 'O3 Mini',
      // DeepSeek
      'deepseek-v4-flash': 'DeepSeek Flash',
      'deepseek-v4': 'DeepSeek V4',
      'deepseek-coder': 'DeepSeek Coder',
      // Google
      'gemini-2.0-flash': 'Gemini Flash',
      'gemini-2.5-pro': 'Gemini Pro',
      'gemini-1.5-pro': 'Gemini 1.5',
      // Meta
      'llama-3.1-405b': 'Llama 3.1 405B',
      'llama-3.1-70b': 'Llama 3.1 70B',
    };

    // Check exact match first
    if (modelDisplayNames[model]) {
      return modelDisplayNames[model];
    }

    // Try to extract a readable name from the model string
    // Remove common prefixes and version numbers
    let name = model
      .replace(/^anthropic\//, '')
      .replace(/^openai\//, '')
      .replace(/^google\//, '')
      .replace(/^meta\//, '')
      .replace(/^deepseek\//, '')
      .replace(/-\d{8}$/, '') // Remove date suffixes like -20250514
      .replace(/-preview$/, '')
      .replace(/-latest$/, '');

    // Capitalize first letter of each word
    name = name.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    
    // Truncate if too long
    if (name.length > 20) {
      name = name.slice(0, 18) + '…';
    }

    return name || 'Hermes';
  }

  private knownSessions = new Set<string>();
}
