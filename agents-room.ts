import Anthropic from "@anthropic-ai/sdk";

/**
 * Multi-Agent Room Exploration System
 * Demonstrates collaborative agent architecture for exploring sync.parc.land
 *
 * This system:
 * 1. Creates a simulated room with agent communication
 * 2. Spawns multiple agents with different perspectives
 * 3. Has them collaboratively explore and analyze content
 * 4. Synthesizes findings through coordination
 */

interface Agent {
  id: string;
  name: string;
  role: string;
  metadata: Record<string, string>;
}

interface RoomMessage {
  id: string;
  agent_id: string;
  kind: string;
  content: string;
  timestamp: string;
}

interface RoomSession {
  roomId: string;
  agents: Map<string, Agent>;
  client: Anthropic;
  messages: RoomMessage[];
}

// Simulated room and API (since network is restricted in this environment)
// In production, this would connect to https://sync.parc.land

// Create a simulated room
function createRoom(): string {
  const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[ROOM API] Created room: ${roomId}`);
  return roomId;
}

// Register agent in room
function registerAgent(
  roomId: string,
  agentName: string,
  role: string,
): Agent {
  const agent: Agent = {
    id: `agent_${Math.random().toString(36).substr(2, 9)}`,
    name: agentName,
    role,
    metadata: {
      role,
      created_at: new Date().toISOString(),
    },
  };
  console.log(`[ROOM API] Registered agent ${agentName} in room ${roomId}`);
  return agent;
}

// Post message to room
function postMessage(
  session: RoomSession,
  agentId: string,
  kind: string,
  content: string,
): void {
  const message: RoomMessage = {
    id: `msg_${Math.random().toString(36).substr(2, 9)}`,
    agent_id: agentId,
    kind,
    content,
    timestamp: new Date().toISOString(),
  };
  session.messages.push(message);
  console.log(`[ROOM API] Agent posted ${kind} message (${message.id})`);
}

// Get messages from room
function getMessages(
  session: RoomSession,
  kind?: string,
): RoomMessage[] {
  return kind
    ? session.messages.filter((m) => m.kind === kind)
    : session.messages;
}

// Run a single agent's exploration
async function runAgentExploration(
  session: RoomSession,
  agent: Agent,
  agentRole: string,
  focusAreas: string[],
): Promise<string> {
  console.log(`\n🤖 ${agent.name} starting analysis...`);

  // Get context from other agents' messages
  const otherMessages = getMessages(session, "finding").filter(
    (m) => m.agent_id !== agent.id,
  );
  const otherFindings = otherMessages
    .map((m) => m.content)
    .join("\n\n");

  const prompt = `You are the ${agentRole} agent in a collaborative research room exploring https://sync.parc.land.

Your focus areas: ${focusAreas.join(", ")}

Other agents' findings so far:
${otherFindings || "(No findings from other agents yet)"}

Based on what you know about sync.parc.land, provide detailed findings from your perspective. Focus on:
${focusAreas.map((area) => `- ${area}`).join("\n")}

Sync.parc.land is a lightweight SQLite-based persistence and synchronization service for multi-agent collaboration. It provides:
- Room-based isolation with GUID keys
- Agent registration and management
- Message system with append-only logs
- Versioned state stores
- Live dashboard for monitoring

Be specific and actionable. Format your findings clearly with headers.`;

  const response = await session.client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1200,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const finding =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Post finding to room
  postMessage(
    session,
    agent.id,
    "finding",
    `**${agent.name}** (${agentRole}):\n${finding}`,
  );

  console.log(`✅ ${agent.name} posted findings`);
  return finding;
}

// Collaborative synthesis phase
async function synthesizeFindings(
  session: RoomSession,
  synthesisAgent: Agent,
): Promise<string> {
  console.log("\n🧠 Synthesizing all findings...");

  const findings = getMessages(session, "finding");
  const allFindings = findings
    .map((m) => m.content)
    .join("\n\n---\n\n");

  const response = await session.client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1800,
    messages: [
      {
        role: "user",
        content: `You are synthesizing findings from multiple agents who explored https://sync.parc.land collaboratively.

All agent findings:
${allFindings}

Create a comprehensive synthesis that:
1. Explains what sync.parc.land is and its core purpose
2. Describes the architectural approach and key innovations
3. Details the main API features (rooms, agents, messages, state)
4. Highlights use cases and benefits for multi-agent systems
5. Explains how the service enables agent collaboration
6. Suggests best practices for using the service

Format as a professional technical summary.`,
      },
    ],
  });

  const synthesis =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Post synthesis
  postMessage(
    session,
    synthesisAgent.id,
    "synthesis",
    synthesis,
  );

  return synthesis;
}

// Main execution
async function runMultiAgentExploration() {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  console.log("\n🚀 Multi-Agent Room Exploration System");
  console.log("======================================\n");

  // Step 1: Create room
  console.log("📍 Creating collaboration room...");
  const roomId = createRoom();
  console.log(`✅ Room created: ${roomId}\n`);

  const session: RoomSession = {
    roomId,
    agents: new Map(),
    client,
    messages: [],
  };

  // Step 2: Register agents
  console.log("🤖 Registering specialized agents...");
  const agentDefinitions = [
    {
      name: "architect",
      role: "System Architecture Analyst",
      focusAreas: [
        "API design",
        "Room structure",
        "Data flow",
        "Scalability patterns",
      ],
    },
    {
      name: "researcher",
      role: "Feature & Capability Analyst",
      focusAreas: [
        "Core features",
        "Use cases",
        "Documentation",
        "Integration patterns",
      ],
    },
    {
      name: "explorer",
      role: "User Interface & Experience Analyst",
      focusAreas: [
        "API endpoints",
        "Live dashboard",
        "User experience",
        "Workflow",
      ],
    },
    {
      name: "analyst",
      role: "Technical Implementation Analyst",
      focusAreas: [
        "Implementation details",
        "Database schema",
        "Message system",
        "State management",
      ],
    },
  ];

  for (const definition of agentDefinitions) {
    const agent = registerAgent(session.roomId, definition.name, definition.role);
    session.agents.set(definition.name, agent);
    console.log(`  ✅ ${definition.name}`);
  }

  console.log("\n");

  // Step 3: Run parallel agent analysis
  console.log("📚 Phase 1: Collaborative Analysis");
  console.log("==================================\n");

  const analysisPromises = agentDefinitions.map((def) =>
    runAgentExploration(
      session,
      session.agents.get(def.name)!,
      def.role,
      def.focusAreas,
    ),
  );

  const findings = await Promise.all(analysisPromises);

  console.log("\n📊 Agent Contributions Summary:");
  for (let i = 0; i < agentDefinitions.length; i++) {
    const summary = findings[i].split("\n")[0];
    console.log(`  ${agentDefinitions[i].name}: ${summary.slice(0, 60)}...`);
  }

  // Step 4: Synthesis
  console.log("\n🤝 Phase 2: Collaborative Synthesis");
  console.log("===================================");

  // Create synthesis agent
  const synthesisAgent = registerAgent(
    session.roomId,
    "synthesizer",
    "Synthesis Coordinator",
  );
  console.log("✅ Synthesis agent registered\n");

  const synthesis = await synthesizeFindings(session, synthesisAgent);

  console.log("\n📋 COMPREHENSIVE SYNTHESIS");
  console.log("=".repeat(70));
  console.log(synthesis);
  console.log("=".repeat(70));

  // Final status
  console.log("\n\n✨ Exploration Complete!\n");
  console.log("📊 Room Statistics:");
  console.log(`  Room ID: ${roomId}`);
  console.log(`  Total Agents: ${session.agents.size + 1}`);
  console.log(`  Total Messages: ${session.messages.length}`);
  console.log(`  Findings Posted: ${getMessages(session, "finding").length}`);
  console.log(`  Synthesis Posted: ${getMessages(session, "synthesis").length}`);
}

// Run the exploration
runMultiAgentExploration().catch(console.error);
