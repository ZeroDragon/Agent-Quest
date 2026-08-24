// server/src/parsers/hermes-parser.ts
import type { AgentActivity, ToolCall } from '../types';
import type { ParsedEvent } from './session-parser';
import type { HermesMessageRow } from './hermes-types';
import { HERMES_TOOL_ACTIVITY_MAP } from './hermes-types';

const GIT_COMMAND_PATTERN = /\bgit\s+(commit|push|merge|rebase|cherry-pick)\b/;
const GH_REVIEW_PATTERN = /\bgh\s+(pr|issue)\s+(review|create|list|view|status|ready|merge|close|comment)\b/;

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
  // Assistant messages with tool_calls - these define WHAT the agent is doing
  if (msg.role === 'assistant' && msg.tool_calls) {
    const toolCallsData = tryParseJson(msg.tool_calls);
    if (!Array.isArray(toolCallsData) || toolCallsData.length === 0) return null;

    // Process each tool call
    const events: ParsedEvent[] = [];
    
    for (const tc of toolCallsData) {
      if (!tc || typeof tc !== 'object') continue;
      
      const func = tc.function;
      if (!func || typeof func !== 'object') continue;
      
      const toolName = func.name;
      if (typeof toolName !== 'string') continue;
      
      // Parse arguments
      let args: Record<string, unknown> = {};
      if (typeof func.arguments === 'string') {
        args = tryParseJson(func.arguments);
      }
      
      // Get the activity for this tool
      let activity = hermesToolToActivity(toolName);
      let command: string | undefined;
      let file: string | undefined;
      
      // Special handling for terminal commands
      if (toolName === 'terminal') {
        command = typeof args.command === 'string' ? args.command : undefined;
        
        // Check if it's a git command
        if (command && GIT_COMMAND_PATTERN.test(command)) {
          activity = 'git';
        }
        // Check if it's a GitHub review command (gh pr review, etc.)
        else if (command && GH_REVIEW_PATTERN.test(command)) {
          activity = 'reviewing';
        }
      }
      
      // Extract file path based on tool type
      if (toolName === 'read_file' || toolName === 'write_file') {
        file = typeof args.path === 'string' ? args.path : undefined;
      } else if (toolName === 'patch') {
        file = typeof args.path === 'string' ? args.path : undefined;
      } else if (toolName === 'search_files') {
        file = typeof args.path === 'string' ? args.path : undefined;
      }
      
      const toolCall: ToolCall = {
        id: tc.id || `hermes-${msg.id}-${toolName}`,
        name: toolName,
        timestamp: Math.floor(msg.timestamp * 1000),
        input: args,
      };
      
      events.push({
        sessionId: msg.session_id,
        slug: undefined,
        timestamp: Math.floor(msg.timestamp * 1000),
        activity,
        toolCalls: [toolCall],
        file,
        command,
        cwd: undefined,
        kind: 'tool',
        isTurnEnd: false,
      });
    }
    
    // Return the first event (or combine if multiple)
    // For simplicity, return the last tool call as the main activity
    return events.length > 0 ? events[events.length - 1] : null;
  }
  
  // Tool results - secondary activity signals (we mainly use assistant tool_calls)
  if (msg.role === 'tool' && msg.tool_name) {
    // Skip tool results - we already captured the activity from assistant message
    return null;
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
