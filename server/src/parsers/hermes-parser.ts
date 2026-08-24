// server/src/parsers/hermes-parser.ts
import type { AgentActivity, ToolCall } from '../types';
import type { ParsedEvent } from './session-parser';
import type { HermesMessageRow } from './hermes-types';
import { HERMES_TOOL_ACTIVITY_MAP } from './hermes-types';

const GIT_COMMAND_PATTERN = /\bgit\s+(commit|push|merge|rebase|cherry-pick)\b/;

/**
 * Extract activity from a Hermes tool name.
 */
export function hermesToolToActivity(toolName: string): AgentActivity {
  return (HERMES_TOOL_ACTIVITY_MAP[toolName] as AgentActivity) ?? 'thinking';
}

/**
 * Extract file path from tool_calls JSON.
 */
function extractFileFromToolCalls(toolCallsJson: string | null, toolName: string): string | undefined {
  if (!toolCallsJson) return undefined;
  
  try {
    const toolCalls = JSON.parse(toolCallsJson);
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return undefined;
    
    const tc = toolCalls[0];
    if (!tc || typeof tc !== 'object') return undefined;
    
    // Different tools store file paths differently
    if (toolName === 'read_file' || toolName === 'write_file') {
      return tc.path ?? tc.file_path;
    }
    if (toolName === 'patch') {
      return tc.path;
    }
    if (toolName === 'search_files') {
      return tc.path;
    }
    if (toolName === 'terminal') {
      return tc.command;
    }
    
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract command from terminal tool_calls JSON.
 */
function extractCommand(toolCallsJson: string | null): string | undefined {
  if (!toolCallsJson) return undefined;
  
  try {
    const toolCalls = JSON.parse(toolCallsJson);
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return undefined;
    
    const tc = toolCalls[0];
    return tc?.command;
  } catch {
    return undefined;
  }
}

/**
 * Parse a single Hermes message row into a ParsedEvent.
 * Returns null for messages that don't generate meaningful events.
 */
export function parseHermesMessage(msg: HermesMessageRow): ParsedEvent | null {
  // Tool results - these are the main activity signals
  if (msg.role === 'tool' && msg.tool_name) {
    const activity = hermesToolToActivity(msg.tool_name);
    
    const toolCalls: ToolCall[] = [{
      id: `hermes-${msg.id}`,
      name: msg.tool_name,
      timestamp: Math.floor(msg.timestamp * 1000),
      input: msg.tool_calls ? tryParseJson(msg.tool_calls) : {},
    }];
    
    // Determine if this is a git command
    const command = msg.tool_name === 'terminal' ? extractCommand(msg.tool_calls) : undefined;
    const isGit = command !== undefined && GIT_COMMAND_PATTERN.test(command);
    
    return {
      sessionId: msg.session_id,
      slug: undefined,
      timestamp: Math.floor(msg.timestamp * 1000),
      activity: isGit ? 'git' : activity,
      toolCalls,
      file: extractFileFromToolCalls(msg.tool_calls, msg.tool_name),
      command,
      cwd: undefined,
      kind: 'tool',
      isTurnEnd: false,
    };
  }
  
  // User messages - capture the prompt
  if (msg.role === 'user' && typeof msg.content === 'string' && msg.content.length > 0) {
    // Skip very short messages (likely commands or empty)
    if (msg.content.length < 3) return null;
    
    return {
      sessionId: msg.session_id,
      slug: undefined,
      timestamp: Math.floor(msg.timestamp * 1000),
      activity: 'thinking',
      toolCalls: [],
      file: undefined,
      command: undefined,
      cwd: undefined,
      kind: 'task',
      currentTask: msg.content.length > 500 
        ? `${msg.content.slice(0, 500)}…` 
        : msg.content,
    };
  }
  
  // Assistant text responses - turn end
  if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.length > 0) {
    return {
      sessionId: msg.session_id,
      slug: undefined,
      timestamp: Math.floor(msg.timestamp * 1000),
      activity: 'idle',
      toolCalls: [],
      file: undefined,
      command: undefined,
      cwd: undefined,
      kind: 'tool',
      lastMessage: msg.content.length > 300
        ? `${msg.content.slice(0, 300)}…`
        : msg.content,
      isTurnEnd: true,
    };
  }
  
  // Skip system messages and empty messages
  return null;
}

/**
 * Parse multiple Hermes messages into ParsedEvents.
 */
export function parseHermesMessages(messages: HermesMessageRow[]): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  for (const msg of messages) {
    const event = parseHermesMessage(msg);
    if (event !== null) {
      events.push(event);
    }
  }
  return events;
}

function tryParseJson(str: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
