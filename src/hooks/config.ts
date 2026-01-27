/**
 * Claude Code Hooks Configuration
 *
 * This module defines the hooks configuration that integrates
 * the playtest framework with Claude Code.
 *
 * Hook types supported by Claude Code:
 * - PreToolUse: Runs before tool execution, can block/modify
 * - PostToolUse: Runs after tool execution, for logging/reactions
 * - Notification: For sending notifications during long operations
 *
 * To install hooks, add to ~/.claude/settings.json or .claude/settings.json:
 * {
 *   "hooks": {
 *     "PreToolUse": [
 *       { "matcher": "Bash", "command": "playtest hook pre-tool $TOOL_NAME" }
 *     ],
 *     "PostToolUse": [
 *       { "matcher": "Bash", "command": "playtest hook post-tool $TOOL_NAME" }
 *     ]
 *   }
 * }
 */

export interface HookConfig {
  matcher: string | string[];
  command: string;
  timeout?: number;
}

export interface HooksSettings {
  PreToolUse?: HookConfig[];
  PostToolUse?: HookConfig[];
  Notification?: HookConfig[];
}

/**
 * Generate hooks configuration for playtest integration
 */
export function generateHooksConfig(playtestPath: string): HooksSettings {
  const cli = `node ${playtestPath}/dist/cli/index.js`;

  return {
    PreToolUse: [
      {
        matcher: 'Bash',
        command: `${cli} hook pre-tool --input "$CLAUDE_TOOL_INPUT"`,
        timeout: 5000,
      },
    ],
    PostToolUse: [
      {
        matcher: 'Bash',
        command: `${cli} hook post-tool --input "$CLAUDE_TOOL_INPUT" --output "$CLAUDE_TOOL_OUTPUT"`,
        timeout: 5000,
      },
    ],
    Notification: [
      {
        matcher: '*',
        command: `${cli} hook notify --message "$CLAUDE_NOTIFICATION"`,
        timeout: 1000,
      },
    ],
  };
}

/**
 * Check if a command matches a playtest game command pattern
 */
export function isGameCommand(command: string): boolean {
  const patterns = [
    /^playtest\s+/,
    /^game\s+/,
    /^play\s+/,
    /^move\s+/,
    /^action\s+/,
  ];
  return patterns.some((p) => p.test(command.trim()));
}

/**
 * Parse a game command from bash input
 */
export function parseGameCommand(input: string): GameCommand | null {
  const match = input.match(/^(playtest|game|play|move|action)\s+(\w+)(?:\s+(.*))?$/);
  if (!match) return null;

  const [, prefix, action, argsStr] = match;
  const args: Record<string, string> = {};

  if (argsStr) {
    // Parse key=value pairs
    const pairs = argsStr.match(/(\w+)=("[^"]*"|\S+)/g) || [];
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      args[key] = value.replace(/^"|"$/g, '');
    }
  }

  return { prefix, action, args };
}

export interface GameCommand {
  prefix: string;
  action: string;
  args: Record<string, string>;
}

/**
 * Format hook response for Claude Code
 *
 * Hook responses can include:
 * - exitCode: 0 for success, non-zero to block
 * - stdout: Message to display
 * - stderr: Error message
 * - decision: For PreToolUse, can be "approve", "block", or "modify"
 */
export interface HookResponse {
  exitCode: number;
  stdout?: string;
  stderr?: string;
  decision?: 'approve' | 'block' | 'modify';
  modifiedInput?: string;
}

export function formatHookResponse(response: HookResponse): string {
  const output: string[] = [];

  if (response.stdout) {
    output.push(response.stdout);
  }

  if (response.decision) {
    output.push(`DECISION: ${response.decision}`);
  }

  if (response.modifiedInput) {
    output.push(`MODIFIED_INPUT: ${response.modifiedInput}`);
  }

  return output.join('\n');
}
