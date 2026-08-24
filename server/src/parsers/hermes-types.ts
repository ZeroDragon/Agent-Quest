// server/src/parsers/hermes-types.ts
// Types matching the Hermes state.db schema

export interface HermesSessionRow {
  id: string;
  source: string;
  user_id: string | null;
  model: string | null;
  model_config: string | null;
  system_prompt: string | null;
  parent_session_id: string | null;
  started_at: number;
  ended_at: number | null;
  end_reason: string | null;
  message_count: number;
  tool_call_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  cwd: string | null;
  billing_provider: string | null;
  billing_base_url: string | null;
  billing_mode: string | null;
  estimated_cost_usd: number | null;
  actual_cost_usd: number | null;
  cost_status: string | null;
  cost_source: string | null;
  pricing_version: string | null;
  title: string | null;
  api_call_count: number;
  session_key: string | null;
  chat_id: string | null;
  chat_type: string | null;
  thread_id: string | null;
  display_name: string | null;
  git_branch: string | null;
  git_repo_root: string | null;
  profile_name: string | null;
  last_activity_at: number | null;
  last_activity_description: string | null;
  pinned: number;
  hidden: number;
}

export interface HermesMessageRow {
  id: number;
  session_id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string | null;
  tool_call_id: string | null;
  tool_calls: string | null;  // JSON array of tool calls
  tool_name: string | null;
  timestamp: number;
  token_count: number | null;
  finish_reason: string | null;
  reasoning: string | null;
  reasoning_content: string | null;
  active: number;
}

// Hermes tool names to AgentQuest activities
export const HERMES_TOOL_ACTIVITY_MAP: Record<string, string> = {
  // Terminal / bash
  'terminal': 'bash',
  'execute_code': 'bash',
  
  // File reading
  'read_file': 'reading',
  'search_files': 'reading',
  'read_preview': 'reading',
  'read_terminal': 'reading',
  
  // File editing
  'write_file': 'editing',
  'patch': 'editing',
  
  // Web
  'web_search': 'reading',
  'web_extract': 'reading',
  'browser_exec': 'bash',
  'drive_preview': 'bash',
  
  // Agent / delegation
  'delegate_task': 'reviewing',
  
  // Memory / session
  'memory': 'thinking',
  'session_search': 'reading',
  
  // Other tools
  'terminal': 'bash',
  'skill_view': 'reading',
  'skills_list': 'reading',
  'todo': 'thinking',
  'clarify': 'thinking',
};
