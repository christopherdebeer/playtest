import { readdir, readFile, stat, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Files grouped by timestamp ID
 */
export interface GameRunFiles {
  timestamp: string;
  game: string;
  mainLog?: string;
  analysisFiles: string[];
  transcripts: string[];
  isComplete: boolean; // All 3 criteria met: game_end + analysis_submitted + analysis file exists
  hasGameEnd: boolean;
  hasAnalysisSubmitted: boolean;
  hasAnalysisFile: boolean;
}

/**
 * Summary of files to be cleaned up
 */
export interface CleanupSummary {
  completeGames: GameRunFiles[];
  incompleteGames: GameRunFiles[];
  orphanedFiles: string[];
  legacyFiles: string[];
  totalFilesToDelete: number;
}

/**
 * Options for cleanup operation
 */
export interface CleanupOptions {
  dryRun: boolean;
  keepTranscripts: boolean;
  archive: boolean;
  force: boolean;
  gamesDir: string;
}

/**
 * Extract timestamp from filename (e.g., "markovs-chains-1770027990374.jsonl" -> "1770027990374")
 */
function extractTimestamp(filename: string): string | null {
  const match = filename.match(/-(\d{13})\.(?:jsonl|md)$/);
  return match ? match[1] : null;
}

/**
 * Check if a JSONL log file contains a specific event
 */
async function hasEvent(logPath: string, eventType: string): Promise<boolean> {
  if (!existsSync(logPath)) {
    return false;
  }

  const fileStream = createReadStream(logPath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  try {
    for await (const line of rl) {
      if (line.trim()) {
        try {
          const event = JSON.parse(line);
          if (event.event === eventType) {
            return true;
          }
        } catch (e) {
          // Skip invalid JSON lines
          continue;
        }
      }
    }
  } catch (e) {
    // Error reading file
    return false;
  }

  return false;
}

/**
 * Scan all game logs and group by timestamp
 */
export async function scanGameLogs(gamesDir: string): Promise<Map<string, Map<string, GameRunFiles>>> {
  const gameMap = new Map<string, Map<string, GameRunFiles>>();

  const games = await readdir(gamesDir);

  for (const game of games) {
    const gamePath = join(gamesDir, game);
    const statInfo = await stat(gamePath);

    if (!statInfo.isDirectory()) {
      continue;
    }

    const logsDir = join(gamePath, 'logs');
    if (!existsSync(logsDir)) {
      continue;
    }

    const files = await readdir(logsDir);
    const timestampMap = new Map<string, GameRunFiles>();

    for (const file of files) {
      const timestamp = extractTimestamp(file);

      if (!timestamp) {
        // Legacy file without timestamp - will be handled separately
        continue;
      }

      if (!timestampMap.has(timestamp)) {
        timestampMap.set(timestamp, {
          timestamp,
          game,
          analysisFiles: [],
          transcripts: [],
          isComplete: false,
          hasGameEnd: false,
          hasAnalysisSubmitted: false,
          hasAnalysisFile: false
        });
      }

      const group = timestampMap.get(timestamp)!;
      const filePath = join(logsDir, file);

      if (file.startsWith('playtest-analysis-v') && file.endsWith('.md')) {
        group.analysisFiles.push(filePath);
        group.hasAnalysisFile = true;
      } else if (file.endsWith('-transcript-' + timestamp + '.jsonl')) {
        group.transcripts.push(filePath);
      } else if (file === `${game}-${timestamp}.jsonl`) {
        group.mainLog = filePath;
      }
    }

    // Check completion criteria for each timestamp group
    for (const [timestamp, group] of timestampMap) {
      if (group.mainLog) {
        group.hasGameEnd = await hasEvent(group.mainLog, 'game_end');
        group.hasAnalysisSubmitted = await hasEvent(group.mainLog, 'analysis_submitted');
      }

      // A game is complete if:
      // 1. Has game_end event, AND
      // 2. (Has analysis_submitted event OR has analysis file)
      //    - This handles older games that have analysis but no analysis_submitted event
      group.isComplete = group.hasGameEnd && (group.hasAnalysisSubmitted || group.hasAnalysisFile);
    }

    gameMap.set(game, timestampMap);
  }

  return gameMap;
}

/**
 * Identify files to delete (incomplete games, orphaned files, legacy files)
 */
export async function identifyFilesToDelete(
  gamesDir: string,
  gameMap: Map<string, Map<string, GameRunFiles>>,
  keepTranscripts: boolean
): Promise<CleanupSummary> {
  const summary: CleanupSummary = {
    completeGames: [],
    incompleteGames: [],
    orphanedFiles: [],
    legacyFiles: [],
    totalFilesToDelete: 0
  };

  // Collect complete and incomplete games
  for (const [game, timestampMap] of gameMap) {
    for (const [timestamp, group] of timestampMap) {
      if (group.isComplete) {
        summary.completeGames.push(group);
      } else {
        summary.incompleteGames.push(group);
      }
    }
  }

  // Identify legacy files (no timestamp) and orphaned files
  const games = await readdir(gamesDir);

  for (const game of games) {
    const gamePath = join(gamesDir, game);
    const statInfo = await stat(gamePath);

    if (!statInfo.isDirectory()) {
      continue;
    }

    const logsDir = join(gamePath, 'logs');
    if (!existsSync(logsDir)) {
      continue;
    }

    const files = await readdir(logsDir);

    for (const file of files) {
      const filePath = join(logsDir, file);
      const timestamp = extractTimestamp(file);

      // Legacy files without timestamp
      if (!timestamp) {
        summary.legacyFiles.push(filePath);
        continue;
      }

      // Check if this file belongs to any known timestamp group
      const timestampMap = gameMap.get(game);
      if (!timestampMap || !timestampMap.has(timestamp)) {
        summary.orphanedFiles.push(filePath);
      }
    }
  }

  // Calculate total files to delete
  summary.totalFilesToDelete = 0;

  // Count files from incomplete games
  for (const group of summary.incompleteGames) {
    if (group.mainLog) summary.totalFilesToDelete++;
    summary.totalFilesToDelete += group.analysisFiles.length;
    summary.totalFilesToDelete += group.transcripts.length;
  }

  // If not keeping transcripts, also count complete game transcripts
  if (!keepTranscripts) {
    for (const group of summary.completeGames) {
      summary.totalFilesToDelete += group.transcripts.length;
    }
  }

  summary.totalFilesToDelete += summary.orphanedFiles.length;
  summary.totalFilesToDelete += summary.legacyFiles.length;

  return summary;
}

/**
 * Create tar.gz archive of game logs directory
 */
export async function createArchive(game: string, gamesDir: string): Promise<string> {
  const gamePath = join(gamesDir, game);
  const logsDir = join(gamePath, 'logs');
  const archivePath = join(gamePath, `logs-archive-${Date.now()}.tar.gz`);

  if (!existsSync(logsDir)) {
    throw new Error(`Logs directory not found: ${logsDir}`);
  }

  // Use tar command to create archive
  await execAsync(`tar -czf "${archivePath}" -C "${gamePath}" logs`);

  return archivePath;
}

/**
 * Delete files identified for cleanup
 */
async function deleteFiles(
  summary: CleanupSummary,
  keepTranscripts: boolean
): Promise<number> {
  let deletedCount = 0;

  // Delete incomplete game files
  for (const group of summary.incompleteGames) {
    if (group.mainLog && existsSync(group.mainLog)) {
      await unlink(group.mainLog);
      deletedCount++;
    }

    for (const file of group.analysisFiles) {
      if (existsSync(file)) {
        await unlink(file);
        deletedCount++;
      }
    }

    for (const file of group.transcripts) {
      if (existsSync(file)) {
        await unlink(file);
        deletedCount++;
      }
    }
  }

  // Delete transcripts from complete games if not keeping them
  if (!keepTranscripts) {
    for (const group of summary.completeGames) {
      for (const file of group.transcripts) {
        if (existsSync(file)) {
          await unlink(file);
          deletedCount++;
        }
      }
    }
  }

  // Delete orphaned files
  for (const file of summary.orphanedFiles) {
    if (existsSync(file)) {
      await unlink(file);
      deletedCount++;
    }
  }

  // Delete legacy files
  for (const file of summary.legacyFiles) {
    if (existsSync(file)) {
      await unlink(file);
      deletedCount++;
    }
  }

  return deletedCount;
}

/**
 * Format cleanup summary as a report
 */
export function formatCleanupReport(
  summary: CleanupSummary,
  archives: string[],
  options: CleanupOptions,
  deletedCount?: number
): string {
  const lines: string[] = [];

  lines.push('Game Logs Cleanup Report');
  lines.push('========================\n');

  // Complete games
  lines.push(`Complete games found: ${summary.completeGames.length}`);
  const gamesByName = new Map<string, string[]>();
  for (const game of summary.completeGames) {
    if (!gamesByName.has(game.game)) {
      gamesByName.set(game.game, []);
    }
    gamesByName.get(game.game)!.push(game.timestamp);
  }
  for (const [game, timestamps] of gamesByName) {
    lines.push(`  - ${game}: ${timestamps.join(', ')}`);
  }
  lines.push('');

  // Files to delete breakdown
  lines.push(`Files to delete: ${summary.totalFilesToDelete}`);

  let incompleteNoEnd = 0;
  let incompleteNoAnalysis = 0;
  for (const game of summary.incompleteGames) {
    if (!game.hasGameEnd) {
      incompleteNoEnd++;
    } else if (!game.hasAnalysisSubmitted && !game.hasAnalysisFile) {
      incompleteNoAnalysis++;
    }
  }

  lines.push(`  - ${incompleteNoEnd} incomplete games (no game_end)`);
  lines.push(`  - ${incompleteNoAnalysis} ended without analysis`);
  lines.push(`  - ${summary.legacyFiles.length} legacy transcripts`);
  lines.push(`  - ${summary.orphanedFiles.length} orphaned files`);

  if (!options.keepTranscripts) {
    const transcriptCount = summary.completeGames.reduce(
      (sum, g) => sum + g.transcripts.length,
      0
    );
    lines.push(`  - ${transcriptCount} transcripts from complete games`);
  }
  lines.push('');

  // Archives
  if (archives.length > 0) {
    lines.push('Archives created:');
    for (const archive of archives) {
      lines.push(`  - ${archive}`);
    }
    lines.push('');
  }

  // Status
  if (options.dryRun) {
    lines.push('Status: DRY RUN (no files deleted)');
  } else if (deletedCount !== undefined) {
    lines.push(`Status: ${deletedCount} files deleted`);
  }

  return lines.join('\n');
}

/**
 * Main cleanup function
 */
export async function cleanupLogs(options: CleanupOptions): Promise<string> {
  // Validate options
  if (!options.dryRun && !options.force) {
    throw new Error('--force flag required to actually delete files (or use --dry-run to preview)');
  }

  // Scan all game logs
  const gameMap = await scanGameLogs(options.gamesDir);

  // Identify files to delete
  const summary = await identifyFilesToDelete(
    options.gamesDir,
    gameMap,
    options.keepTranscripts
  );

  // Create archives if requested
  const archives: string[] = [];
  if (options.archive && !options.dryRun) {
    const gamesWithFilesToDelete = new Set<string>();

    for (const game of summary.incompleteGames) {
      gamesWithFilesToDelete.add(game.game);
    }

    if (!options.keepTranscripts) {
      for (const game of summary.completeGames) {
        if (game.transcripts.length > 0) {
          gamesWithFilesToDelete.add(game.game);
        }
      }
    }

    for (const game of gamesWithFilesToDelete) {
      try {
        const archivePath = await createArchive(game, options.gamesDir);
        archives.push(archivePath);
      } catch (e) {
        console.error(`Failed to create archive for ${game}:`, e);
      }
    }
  }

  // Delete files if not dry run
  let deletedCount: number | undefined;
  if (!options.dryRun) {
    deletedCount = await deleteFiles(summary, options.keepTranscripts);
  }

  // Generate report
  return formatCleanupReport(summary, archives, options, deletedCount);
}
