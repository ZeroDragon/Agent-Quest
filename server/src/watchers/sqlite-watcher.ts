// server/src/watchers/sqlite-watcher.ts
import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { HermesSessionRow, HermesMessageRow } from '../parsers/hermes-types';

export interface SqliteWatcherCallbacks {
  onSessionStart: (sessionId: string, source: string, cwd: string | null, model: string | null, parentSessionId: string | null) => void;
  onSessionUpdate: (sessionId: string, newMessages: HermesMessageRow[]) => void;
}

export interface SqliteWatcherOptions {
  /** How often to poll the database. Default 3000ms. */
  scanIntervalMs?: number;
  /** Only consider sessions active if last_activity_at is within this window. Default 300s (5 min). */
  activeWindowSec?: number;
  /** Custom path to state.db. Default ~/.hermes/state.db */
  dbPath?: string;
}

export class SqliteWatcher {
  private db: Database | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastMessageTimestamps = new Map<string, number>();
  private knownSessions = new Set<string>();
  private callbacks: SqliteWatcherCallbacks;
  private readonly scanIntervalMs: number;
  private readonly activeWindowSec: number;
  private readonly dbPath: string;
  private scanning = false;

  constructor(callbacks: SqliteWatcherCallbacks, opts: SqliteWatcherOptions = {}) {
    this.callbacks = callbacks;
    this.scanIntervalMs = opts.scanIntervalMs ?? 3000;
    this.activeWindowSec = opts.activeWindowSec ?? 300;
    this.dbPath = opts.dbPath ?? join(homedir(), '.hermes', 'state.db');
  }

  async start(): Promise<boolean> {
    try {
      this.db = new Database(this.dbPath, { readonly: true });
    } catch (err) {
      console.warn('[SqliteWatcher] Cannot open state.db:', err);
      return false;
    }

    await this.scan();
    this.pollInterval = setInterval(() => {
      this.scan().catch(err => {
        console.error('[SqliteWatcher] scan error:', err);
      });
    }, this.scanIntervalMs);

    console.log(`[SqliteWatcher] watching ${this.dbPath} every ${this.scanIntervalMs}ms`);
    return true;
  }

  stop(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.db?.close();
    this.db = null;
  }

  isActive(): boolean {
    return this.db !== null;
  }

  private async scan(): Promise<void> {
    if (!this.db || this.scanning) return;
    this.scanning = true;

    try {
      // Find active sessions (no ended_at, active within window)
      const cutoff = Date.now() / 1000 - this.activeWindowSec;
      
      const activeSessions = this.db.query(`
        SELECT id, source, cwd, model, last_activity_at, parent_session_id 
        FROM sessions 
        WHERE ended_at IS NULL 
        AND last_activity_at > ?
        AND hidden = 0
        ORDER BY last_activity_at DESC
      `).all(cutoff) as HermesSessionRow[];

      for (const session of activeSessions) {
        await this.processSession(session);
      }
    } finally {
      this.scanning = false;
    }
  }

  private async processSession(session: HermesSessionRow): Promise<void> {
    if (!this.db) return;

    const lastTs = this.lastMessageTimestamps.get(session.id) ?? 0;

    // Get new messages since last check
    const newMessages = this.db.query(`
      SELECT * FROM messages 
      WHERE session_id = ? AND timestamp > ?
      AND active = 1
      ORDER BY timestamp ASC
      LIMIT 100
    `).all(session.id, lastTs) as HermesMessageRow[];

    if (newMessages.length === 0) return;

    // First time seeing this session - notify start
    if (!this.knownSessions.has(session.id)) {
      this.knownSessions.add(session.id);
      this.callbacks.onSessionStart(
        session.id,
        session.source,
        session.cwd,
        session.model,
        session.parent_session_id
      );
    }

    // Notify update with new messages
    this.callbacks.onSessionUpdate(session.id, newMessages);

    // Update last timestamp
    const maxTs = Math.max(...newMessages.map(m => m.timestamp));
    this.lastMessageTimestamps.set(session.id, maxTs);
  }
}
