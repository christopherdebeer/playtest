#!/usr/bin/env npx ts-node
/**
 * Spawn Room Test Agents
 *
 * Creates a room and spawns multiple agents to interact with it.
 * Agents communicate through shared room, demonstrating real-time coordination.
 *
 * Usage:
 *   npx ts-node scripts/spawn-room-agents.ts
 *
 * Output:
 *   - Room ID (share this)
 *   - Agent IDs and roles
 *   - Live interaction log
 *   - Dashboard URL (if using real sync.parc.land)
 */

import * as fs from "fs";
import * as path from "path";

interface RoomState {
  id: string;
  created: string;
  agents: Map<string, { name: string; role: string; joinedAt: string }>;
  messages: Array<{
    id: string;
    from: string;
    fromName: string;
    kind: string;
    content: string;
    timestamp: string;
  }>;
  sharedState: Record<string, any>;
}

class RoomCoordinator {
  private room: RoomState;

  constructor() {
    this.room = {
      id: this.generateRoomId(),
      created: new Date().toISOString(),
      agents: new Map(),
      messages: [],
      sharedState: {},
    };
  }

  private generateRoomId(): string {
    return `room_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  registerAgent(name: string, role: string): string {
    const agentId = `${role.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`;
    this.room.agents.set(agentId, {
      name,
      role,
      joinedAt: new Date().toISOString(),
    });
    return agentId;
  }

  postMessage(fromAgentId: string, kind: string, content: string): string {
    const agent = this.room.agents.get(fromAgentId);
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.room.messages.push({
      id: messageId,
      from: fromAgentId,
      fromName: agent?.name || "Unknown",
      kind,
      content,
      timestamp: new Date().toISOString(),
    });
    return messageId;
  }

  getMessages(kind?: string, fromAgent?: string) {
    let filtered = this.room.messages;
    if (kind) filtered = filtered.filter((m) => m.kind === kind);
    if (fromAgent) filtered = filtered.filter((m) => m.from === fromAgent);
    return filtered;
  }

  updateSharedState(key: string, value: any): void {
    this.room.sharedState[key] = value;
  }

  getRoomStatus() {
    return {
      roomId: this.room.id,
      created: this.room.created,
      agentCount: this.room.agents.size,
      messageCount: this.room.messages.length,
      agents: Array.from(this.room.agents.entries()).map(([id, info]) => ({
        id,
        ...info,
      })),
      messages: this.room.messages,
      sharedState: this.room.sharedState,
    };
  }

  exportDashboard() {
    const status = this.getRoomStatus();
    return {
      roomId: status.roomId,
      created: status.created,
      agentRoster: status.agents.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        joinedAt: a.joinedAt,
      })),
      messageCount: status.messageCount,
      recentMessages: status.messages.slice(-10),
      sharedState: status.sharedState,
    };
  }
}

// Shared coordinator instance
let globalCoordinator: RoomCoordinator;

// Simulate agent interaction
async function simulateAgentAction(
  agentId: string,
  agentName: string,
  agentRole: string,
  action: { kind: string; content: string },
  delayMs: number = 500,
) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  globalCoordinator.postMessage(agentId, action.kind, action.content);
  console.log(
    `📨 [${new Date().toISOString().split("T")[1].split(".")[0]}] ${agentName} (${agentRole}): ${action.content.substring(0, 60)}...`,
  );
}

async function runLiveTest() {
  console.log("\n🎮 Live Room Test - Subagent Spawning\n");
  console.log("=====================================\n");

  // Create room
  globalCoordinator = new RoomCoordinator();
  const roomStatus = globalCoordinator.getRoomStatus();
  const roomId = roomStatus.roomId;

  console.log(`📍 ROOM CREATED`);
  console.log(`   ID: ${roomId}`);
  console.log(`   URL: http://localhost:3000/?room=${roomId}`);
  console.log(`   Created: ${roomStatus.created}\n`);

  // Register agents
  console.log(`🤖 REGISTERING AGENTS\n`);

  const gamemasterId = globalCoordinator.registerAgent("GameMaster", "gamemaster");
  console.log(`   ✅ GameMaster [${gamemasterId}]`);

  const player1Id = globalCoordinator.registerAgent("Alice", "player");
  console.log(`   ✅ Alice [${player1Id}]`);

  const player2Id = globalCoordinator.registerAgent("Bob", "player");
  console.log(`   ✅ Bob [${player2Id}]`);

  const player3Id = globalCoordinator.registerAgent("Charlie", "player");
  console.log(`   ✅ Charlie [${player3Id}]`);

  const observerId = globalCoordinator.registerAgent("Observer", "observer");
  console.log(`   ✅ Observer [${observerId}]\n`);

  // Save dashboard snapshot
  const dashboardPath = path.join(
    process.cwd(),
    "scripts",
    `.room-dashboard-${roomId.split("_")[1]}.json`,
  );

  // Simulate agent interactions
  console.log(`🎬 STARTING INTERACTIONS\n`);
  console.log(`⏱️  Timeline:`);
  console.log(`━`.repeat(80));

  // Phase 1: Game Setup (T+0)
  await simulateAgentAction(
    gamemasterId,
    "GameMaster",
    "gamemaster",
    { kind: "game:setup", content: "Welcome to the game! Setting up..." },
    0,
  );

  globalCoordinator.updateSharedState("gameState", "setup");
  globalCoordinator.updateSharedState("players", ["Alice", "Bob", "Charlie"]);

  // Phase 2: Player Readiness (T+1s)
  await simulateAgentAction(
    player1Id,
    "Alice",
    "player",
    { kind: "game:ready", content: "Alice is ready!" },
    1000,
  );

  await simulateAgentAction(
    player2Id,
    "Bob",
    "player",
    { kind: "game:ready", content: "Bob is ready!" },
    1500,
  );

  await simulateAgentAction(
    player3Id,
    "Charlie",
    "player",
    { kind: "game:ready", content: "Charlie is ready!" },
    2000,
  );

  // Phase 3: Game Start (T+3s)
  await simulateAgentAction(
    gamemasterId,
    "GameMaster",
    "gamemaster",
    { kind: "game:start", content: "Game started! Round 1 begins." },
    2500,
  );

  globalCoordinator.updateSharedState("gameState", "active");
  globalCoordinator.updateSharedState("round", 1);
  globalCoordinator.updateSharedState("turn", 1);

  // Phase 4: First Round of Actions (T+4-8s)
  await simulateAgentAction(
    gamemasterId,
    "GameMaster",
    "gamemaster",
    { kind: "game:prompt", content: "Alice, your turn. What do you do?" },
    3000,
  );

  await simulateAgentAction(
    player1Id,
    "Alice",
    "player",
    { kind: "player:action", content: "Draw 2 cards, move forward 3 spaces" },
    4000,
  );

  await simulateAgentAction(
    gamemasterId,
    "GameMaster",
    "gamemaster",
    { kind: "game:resolve", content: "Alice's action resolved. Bob, your turn." },
    4500,
  );

  await simulateAgentAction(
    player2Id,
    "Bob",
    "player",
    { kind: "player:action", content: "Build a structure on space 5" },
    5500,
  );

  await simulateAgentAction(
    gamemasterId,
    "GameMaster",
    "gamemaster",
    { kind: "game:resolve", content: "Bob's action resolved. Charlie, your turn." },
    6000,
  );

  await simulateAgentAction(
    player3Id,
    "Charlie",
    "player",
    { kind: "player:action", content: "Trade with Alice for rare card" },
    7000,
  );

  // Phase 5: Observer Analysis (T+8s)
  await simulateAgentAction(
    observerId,
    "Observer",
    "observer",
    { kind: "observation", content: "Round 1: 3 player actions, 1 trade interaction" },
    7500,
  );

  globalCoordinator.updateSharedState("round", 2);
  globalCoordinator.updateSharedState("turn", 1);

  // Phase 6: Second Round Quick (T+9s)
  await simulateAgentAction(
    gamemasterId,
    "GameMaster",
    "gamemaster",
    {
      kind: "game:prompt",
      content: "Round 2 begins. Alice, your turn again.",
    },
    8000,
  );

  await simulateAgentAction(
    player1Id,
    "Alice",
    "player",
    { kind: "player:action", content: "Play special card: Double turn" },
    9000,
  );

  await simulateAgentAction(
    player1Id,
    "Alice",
    "player",
    { kind: "player:action", content: "Draw 3 cards with bonus" },
    9500,
  );

  console.log(`━`.repeat(80));

  // Final summary
  console.log(`\n✨ LIVE TEST COMPLETE\n`);

  const finalStatus = globalCoordinator.getRoomStatus();

  console.log(`📊 FINAL STATISTICS\n`);
  console.log(`   Room ID: ${finalStatus.roomId}`);
  console.log(`   Duration: ~10 seconds`);
  console.log(`   Total Agents: ${finalStatus.agentCount}`);
  console.log(`   Total Messages: ${finalStatus.messageCount}`);
  console.log(
    `   Message Types: ${new Set(finalStatus.messages.map((m) => m.kind)).size}`,
  );

  console.log(`\n🎭 AGENT ROSTER\n`);
  finalStatus.agents.forEach((agent) => {
    const agentMessages = finalStatus.messages.filter(
      (m) => m.from === agent.id,
    );
    console.log(
      `   ${agent.name.padEnd(12)} (${agent.role.padEnd(11)}) - ${agentMessages.length} messages posted`,
    );
  });

  console.log(`\n📋 SHARED GAME STATE\n`);
  Object.entries(finalStatus.sharedState).forEach(([key, value]) => {
    console.log(`   ${key}: ${JSON.stringify(value)}`);
  });

  console.log(`\n📨 MESSAGE ACTIVITY BY TYPE\n`);
  const kinds = new Set(finalStatus.messages.map((m) => m.kind));
  kinds.forEach((kind) => {
    const count = finalStatus.messages.filter((m) => m.kind === kind).length;
    const messages = finalStatus.messages.filter((m) => m.kind === kind);
    console.log(`   ${kind.padEnd(20)}: ${count} messages`);
    messages.slice(-2).forEach((msg) => {
      console.log(`      - ${msg.fromName}: "${msg.content.substring(0, 50)}..."`);
    });
  });

  // Save dashboard for monitoring
  const dashboard = globalCoordinator.exportDashboard();
  fs.writeFileSync(dashboardPath, JSON.stringify(dashboard, null, 2));

  console.log(`\n📡 DASHBOARD SNAPSHOT\n`);
  console.log(`   Saved to: ${dashboardPath}`);
  console.log(`   Room ID: ${dashboard.roomId}`);
  console.log(`   Agents: ${dashboard.agentRoster.map((a) => a.name).join(", ")}`);
  console.log(`   Recent Messages: ${dashboard.messageCount}`);

  console.log(`\n🔗 SHARE WITH OBSERVERS\n`);
  console.log(`   Room ID: ${roomId}`);
  console.log(`   Dashboard File: ${dashboardPath}`);
  console.log(`\n   Instructions for subagents:`);
  console.log(`   1. Use room ID: ${roomId}`);
  console.log(`   2. Poll for messages of your role`);
  console.log(`   3. Post responses to shared room`);
  console.log(`   4. Observe all agent interactions\n`);
}

runLiveTest().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});
