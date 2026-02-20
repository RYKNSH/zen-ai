// ============================================================================
// ZEN AI Discord Bot — Main Bot Class
// The bridge between ZEN AI agents and Discord.
// ============================================================================

import {
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
    Events,
    ActivityType,
    TextBasedChannel,
    ChannelType,
    type ChatInputCommandInteraction,
    type Message,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    ComponentType,
} from "discord.js";
import { ZenAgent } from "@zen-ai/core";
import type { ZenAgentConfig, Tool, LLMAdapter } from "@zen-ai/core";
import { OpenAIAdapter } from "@zen-ai/adapter-openai";
import type { OpenAIAdapterConfig } from "@zen-ai/adapter-openai";
import { SkillDB, FailureKnowledgeDB, KarmaMemory } from "@zen-ai/memory";
import {
    fileReadTool,
    fileWriteTool,
    httpTool,
    createShellTool,
    directoryListTool,
    codeSearchTool,
    codeEditTool,
    projectScaffoldTool,
    createForgeTool,
    loadForgedTools,
} from "@zen-ai/tools";
import {
    zenRunCommand,
    handleZenRun,
    runZenAgent,
} from "./commands/zen-commands.js";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

/** Configuration for the ZEN AI Discord Bot. */
export interface ZenDiscordBotConfig {
    /** Discord Bot Token. Defaults to DISCORD_BOT_TOKEN env var. */
    token?: string;
    /** Discord Application/Client ID. Defaults to DISCORD_CLIENT_ID env var. */
    clientId?: string;
    /** OpenAI adapter configuration. */
    llmConfig?: OpenAIAdapterConfig;
    /** Additional tools for agents. */
    tools?: Tool[];
    /** Default max steps per agent run. Default: 30. */
    maxStepsPerRun?: number;
    /** Enable SkillDB persistence. */
    skillDBPath?: string;
    /** Enable FailureDB persistence. */
    failureDBPath?: string;
}

/**
 * ZEN AI Discord Bot.
 *
 * Integrates ZEN AI agents with Discord via slash commands.
 * Supports both guild channels and DMs.
 */
export class ZenDiscordBot {
    private client: Client;
    private agents: Map<string, ZenAgent> = new Map();
    /** Per-user agents for DM chat (persistent). */
    private dmAgents: Map<string, ZenAgent> = new Map();
    private llmAdapters: Map<string, LLMAdapter> = new Map();
    /** DM conversation history per user (userId → messages). */
    private dmHistory: Map<string, Array<{ role: "user" | "assistant"; content: string }>> = new Map();
    private config: Required<
        Pick<ZenDiscordBotConfig, "maxStepsPerRun">
    > &
        ZenDiscordBotConfig;

    constructor(config: ZenDiscordBotConfig = {}) {
        this.config = {
            maxStepsPerRun: 30,
            ...config,
        };

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.MessageContent,
            ],
            partials: [Partials.Channel, Partials.Message],
        });

        this.setupEventHandlers();
    }

    /** Start the bot. */
    async start(): Promise<void> {
        const token = this.config.token ?? process.env.DISCORD_BOT_TOKEN;
        if (!token) {
            throw new Error(
                "DISCORD_BOT_TOKEN is required. Set it in .env or pass in config.",
            );
        }

        console.log("🧘 ZEN AI Discord Bot starting...");
        await this.client.login(token);
    }

    /** Stop the bot. */
    async stop(): Promise<void> {
        for (const [id, agent] of this.agents) {
            agent.stop();
            this.agents.delete(id);
        }
        this.client.destroy();
        console.log("🧘 ZEN AI Discord Bot stopped.");
    }

    /** Register slash commands with Discord. */
    async deployCommands(): Promise<void> {
        const token = this.config.token ?? process.env.DISCORD_BOT_TOKEN;
        const clientId = this.config.clientId ?? process.env.DISCORD_CLIENT_ID;

        if (!token || !clientId) {
            throw new Error(
                "DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID are required for command deployment.",
            );
        }

        const rest = new REST().setToken(token);

        console.log("🧘 Deploying slash commands...");
        await rest.put(Routes.applicationCommands(clientId), {
            body: [zenRunCommand.toJSON()],
        });
        console.log("✅ Slash commands deployed.");
    }

    /** Create agent config from a goal string. */
    private createAgentConfig(goal: string, maxSteps: number): ZenAgentConfig {
        const llm = new OpenAIAdapter(this.config.llmConfig);

        // Forge tool needs a ref to addTool — we'll set it after agent creation
        const forgeDir = join(process.cwd(), "data", "forged-tools");

        const tools: Tool[] = [
            fileReadTool,
            fileWriteTool,
            httpTool,
            directoryListTool,
            codeSearchTool,
            codeEditTool,
            projectScaffoldTool,
            createShellTool({ mode: "sandboxed" }),
            ...(this.config.tools ?? []),
        ];

        const config: ZenAgentConfig = {
            goal,
            llm,
            tools,
            maxSteps: Math.min(maxSteps, this.config.maxStepsPerRun),
        };

        if (this.config.skillDBPath) {
            config.skillDB = new SkillDB({
                persistPath: this.config.skillDBPath,
                llm,
            });
        }

        if (this.config.failureDBPath) {
            config.failureDB = new FailureKnowledgeDB({
                persistPath: this.config.failureDBPath,
                llm,
            });
        }

        return config;
    }

    /** Set up Discord event handlers. */
    private setupEventHandlers(): void {
        this.client.once(Events.ClientReady, (c) => {
            console.log(`🧘 ZEN AI Bot online as ${c.user.tag}`);
        });

        this.client.on(Events.InteractionCreate, async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            const subcommand = interaction.options.getSubcommand();

            try {
                switch (subcommand) {
                    case "run":
                        await handleZenRun(
                            interaction,
                            this.agents,
                            (goal, maxSteps) =>
                                this.createAgentConfig(goal, maxSteps),
                        );
                        break;

                    case "stop":
                        await this.handleStop(interaction);
                        break;

                    case "status":
                        await this.handleStatus(interaction);
                        break;

                    case "pause":
                        await this.handlePause(interaction);
                        break;

                    case "ask":
                        await this.handleAsk(interaction);
                        break;

                    case "skills":
                        await this.handleSkills(interaction);
                        break;

                    case "failures":
                        await this.handleFailures(interaction);
                        break;

                    case "artifacts":
                        await this.handleArtifacts(interaction);
                        break;

                    default:
                        await interaction.reply({
                            content: `知らないコマンドだよ: ${subcommand}`,
                            ephemeral: true,
                        });
                }
            } catch (error) {
                const msg =
                    error instanceof Error ? error.message : String(error);
                if (interaction.deferred || interaction.replied) {
                    await interaction
                        .followUp(msg)
                        .catch(console.error);
                } else {
                    await interaction
                        .reply({ content: msg, ephemeral: true })
                        .catch(console.error);
                }
            }
        });

        // --- Natural language DM handler ---
        this.client.on(Events.MessageCreate, async (message: Message) => {
            // Ignore bots and non-DM messages
            if (message.author.bot) return;
            if (message.channel.type !== ChannelType.DM) return;

            const userId = message.author.id;
            const userText = message.content.trim();
            if (!userText) return;

            try {
                await message.channel.sendTyping();

                // Get or create persistent agent for this user
                let agent = this.dmAgents.get(userId);

                if (!agent) {
                    // Initialize user-specific persistence
                    const userDir = join(process.cwd(), "data", "users", userId);
                    if (!existsSync(userDir)) {
                        mkdirSync(userDir, { recursive: true });
                    }

                    const llm = new OpenAIAdapter(this.config.llmConfig);
                    const failureDB = new FailureKnowledgeDB({
                        persistPath: join(userDir, "failures.json"),
                    });
                    const karmaDB = new KarmaMemory({
                        persistPath: join(userDir, "karma.db"),
                    });
                    // Shared skill DB (read-only for now, or user-specific if we want)
                    const skillDB = this.config.skillDBPath
                        ? new SkillDB({ persistPath: this.config.skillDBPath })
                        : undefined;

                    agent = new ZenAgent({
                        goal: "ユーザーの良き対話相手となり、共に学び、成長すること。",
                        llm,
                        failureDB,
                        karmaMemoryDB: karmaDB,
                        skillDB,
                        selfModelPath: join(userDir, "self_model.json"),
                        maxSteps: 5, // Chat doesn't use steps much, but needed for config
                    });

                    // Load DBs
                    await failureDB.load();
                    await karmaDB.load();
                    if (skillDB) await skillDB.load();

                    // Load Chat History
                    const historyPath = join(userDir, "chat_history.json");
                    if (existsSync(historyPath)) {
                        try {
                            const raw = readFileSync(historyPath, "utf-8");
                            const history = JSON.parse(raw);
                            if (Array.isArray(history)) {
                                agent.setChatHistory(history);
                            }
                        } catch (e) {
                            console.error("Failed to load chat history:", e);
                        }
                    }

                    // --- Listener removed (handled via chat response toolCalls) ---

                    this.dmAgents.set(userId, agent);
                }

                // Chat with the agent
                const reply = await agent.chat(userText);

                // Check for task proposal
                const taskTool = reply.toolCalls?.find(tc => tc.name === "start_task");
                if (taskTool) {
                    const args = taskTool.arguments as { goal: string; reasoning?: string };

                    const confirmMsg = await message.reply({
                        content: `**提案**: タスク「${args.goal}」を開始しますか？\n(理由: ${args.reasoning ?? "なし"})`,
                        components: [
                            new ActionRowBuilder<ButtonBuilder>().addComponents(
                                new ButtonBuilder()
                                    .setCustomId('start_task')
                                    .setLabel('開始する')
                                    .setStyle(ButtonStyle.Success),
                                new ButtonBuilder()
                                    .setCustomId('cancel_task')
                                    .setLabel('キャンセル')
                                    .setStyle(ButtonStyle.Secondary)
                            )
                        ]
                    });

                    // Collector for the buttons
                    try {
                        const confirmation = await confirmMsg.awaitMessageComponent({
                            filter: i => i.user.id === userId,
                            time: 60000,
                            componentType: ComponentType.Button
                        });

                        if (confirmation.customId === 'start_task') {
                            await confirmation.update({ content: `🚀 タスク「${args.goal}」を開始します...`, components: [] });

                            // Execute logic
                            await runZenAgent(
                                args.goal,
                                this.agents,
                                (g, s) => this.createAgentConfig(g, s),
                                message.channel as unknown as TextBasedChannel,
                                userId,
                                30
                            );
                        } else {
                            await confirmation.update({ content: "キャンセルしました。", components: [] });
                        }
                    } catch (e) {
                        await confirmMsg.edit({ content: "タイムアウトしました。", components: [] });
                    }
                    // Return here to avoid showing the redundant text reply from agent or cost info for the confirmation itself
                    return;
                }

                // Calculate estimated cost (Simple calculation for now)
                // GPT-4o: Input $5/1M, Output $15/1M
                let costInfo = "";
                if (reply.usage) {
                    const inputCost = (reply.usage.promptTokens / 1_000_000) * 5.0;
                    const outputCost = (reply.usage.completionTokens / 1_000_000) * 15.0;
                    const totalCost = inputCost + outputCost;
                    costInfo = `\n(💰 $${totalCost.toFixed(6)})`;
                }

                // Save Chat History
                try {
                    const state = agent.getState();
                    if (state.chatHistory) {
                        const historyPath = join(process.cwd(), "data", "users", userId, "chat_history.json");
                        writeFileSync(historyPath, JSON.stringify(state.chatHistory, null, 2), "utf-8");
                    }
                } catch (e) {
                    console.error("Failed to save chat history:", e);
                }

                // Discord message limit: 2000 chars
                // Append cost info to the last chunk
                const totalContent = reply.content + costInfo;

                if (totalContent.length <= 2000) {
                    await message.reply(totalContent);
                } else {
                    // Split into chunks
                    for (let i = 0; i < totalContent.length; i += 2000) {
                        const chunk = totalContent.slice(i, i + 2000);
                        if (i === 0) await message.reply(chunk);
                        else await message.channel.send(chunk);
                    }
                }
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                console.error("DM error:", msg);
                await message.reply("ごめん、ちょっとエラーが出ちゃった 🙏").catch(() => { });
            }
        });
    }

    /** Handle /zen stop. */
    private async handleStop(
        interaction: ChatInputCommandInteraction,
    ): Promise<void> {
        const contextId = interaction.guildId ?? interaction.user.id;
        if (!this.agents.has(contextId)) {
            await interaction.reply({
                content: "今はエージェント動いてないよ",
                ephemeral: true,
            });
            return;
        }

        const agent = this.agents.get(contextId)!;
        agent.stop();
        this.agents.delete(contextId);

        await interaction.reply("🧘 エージェント止めたよ");
    }

    /** Handle /zen status — now with Buddhist AI metrics. */
    private async handleStatus(
        interaction: ChatInputCommandInteraction,
    ): Promise<void> {
        const contextId = interaction.guildId ?? interaction.user.id;
        if (!this.agents.has(contextId)) {
            await interaction.reply({
                content: "今はエージェント動いてないよ",
                ephemeral: true,
            });
            return;
        }

        const agent = this.agents.get(contextId)!;
        const state = agent.getState();

        // Use import at top — need to add this import
        const { agentStatusEmbed } = await import("./formatters/embed-builder.js");

        const embed = agentStatusEmbed({
            goal: state.goal,
            stepCount: state.stepCount,
            delta: state.delta ?? undefined,
            currentMilestoneIndex: state.currentMilestoneIndex,
            running: true,
            buddhistMetrics: state.buddhistMetrics,
        });

        await interaction.reply({ embeds: [embed] });
    }

    /** Handle /zen pause. */
    private async handlePause(
        interaction: ChatInputCommandInteraction,
    ): Promise<void> {
        const contextId = interaction.guildId ?? interaction.user.id;
        if (!this.agents.has(contextId)) {
            await interaction.reply({
                content: "今はエージェント動いてないよ",
                ephemeral: true,
            });
            return;
        }

        const agent = this.agents.get(contextId)!;
        const state = agent.getState();
        agent.stop();
        this.agents.delete(contextId);
        this.llmAdapters.delete(contextId);

        await interaction.reply(
            `⏸️ 一時停止したよ。ゴール「${state.goal}」、${state.stepCount}ステップ目まで進んでた`,
        );
    }

    /** Handle /zen ask. */
    private async handleAsk(
        interaction: ChatInputCommandInteraction,
    ): Promise<void> {
        const contextId = interaction.guildId ?? interaction.user.id;
        const question = interaction.options.getString("question", true);

        let llm = this.llmAdapters.get(contextId);
        if (!llm) {
            llm = new OpenAIAdapter(this.config.llmConfig);
        }

        await interaction.deferReply();

        try {
            const agentContext = this.agents.has(contextId)
                ? `Current agent state: ${JSON.stringify(this.agents.get(contextId)!.getState(), null, 2)}`
                : "No agent is currently running.";

            const answer = await llm.complete(
                `You are a ZEN AI assistant. Respond in the same language as the question. Be concise and natural, like a friend chatting. ${agentContext}\n\nUser question: ${question}`,
            );

            await interaction.followUp(answer);
        } catch (error) {
            await interaction.followUp(
                `ごめん、エラーが出た: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /** Handle /zen skills. */
    private async handleSkills(
        interaction: ChatInputCommandInteraction,
    ): Promise<void> {
        if (!this.config.skillDBPath) {
            await interaction.reply({
                content: "SkillDB設定されてないよ",
                ephemeral: true,
            });
            return;
        }

        const llm = new OpenAIAdapter(this.config.llmConfig);
        const db = new SkillDB({
            persistPath: this.config.skillDBPath,
            llm,
        });

        const skills = await db.list();
        if (skills.length === 0) {
            await interaction.reply("まだスキル学習してないよ");
            return;
        }

        const list = skills
            .map((s, i) => `${i + 1}. ${s.trigger} → ${s.command}`)
            .join("\n");
        await interaction.reply(`📚 学習したスキル:\n${list}`);
    }

    /** Handle /zen failures. */
    private async handleFailures(
        interaction: ChatInputCommandInteraction,
    ): Promise<void> {
        if (!this.config.failureDBPath) {
            await interaction.reply({
                content: "FailureDB設定されてないよ",
                ephemeral: true,
            });
            return;
        }

        const llm = new OpenAIAdapter(this.config.llmConfig);
        const db = new FailureKnowledgeDB({
            persistPath: this.config.failureDBPath,
            llm,
        });

        const failures = db.exportCurrent();
        if (failures.length === 0) {
            await interaction.reply("まだ失敗記録ないよ");
            return;
        }

        const list = failures
            .map((f, i) => `${i + 1}. "${f.proverb}" — ${f.condition}`)
            .join("\n");
        await interaction.reply(`📝 失敗から学んだこと:\n${list}`);
    }

    /** Build dynamic agent context for DM system prompt. */
    private buildAgentContext(userId: string): string {
        // Check for agent running under this user's DM context
        const agent = this.agents.get(userId);
        if (!agent) return "";

        const state = agent.getState();
        const artifacts = state.artifacts ?? [];
        const progress = state.delta
            ? `${Math.round(state.delta.progress * 100)}%`
            : "計算中";

        const lines = [
            "## 現在のエージェント状態",
            `ゴール: ${state.goal.description}`,
            `進捗: ${progress}`,
            `ステップ: ${state.stepCount}`,
        ];

        if (state.delta?.gaps?.length) {
            lines.push(`残課題: ${state.delta.gaps.join(", ")}`);
        }

        if (artifacts.length > 0) {
            lines.push("");
            lines.push(`## 成果物 (${artifacts.length}件)`);
            for (const a of artifacts.slice(-10)) {
                lines.push(`- Step ${a.step}: ${a.toolName} — ${a.description}`);
            }
        }

        lines.push("");
        lines.push("ユーザーが成果物や進捗について聞いたら、上記の情報を元に自然に答えて。");

        return lines.join("\n");
    }

    /** Handle /zen artifacts. */
    private async handleArtifacts(
        interaction: ChatInputCommandInteraction,
    ): Promise<void> {
        const contextId = interaction.guildId ?? interaction.user.id;
        if (!this.agents.has(contextId)) {
            await interaction.reply({
                content: "今はエージェント動いてないよ。完了後は成果物がリセットされるよ",
                ephemeral: true,
            });
            return;
        }

        const agent = this.agents.get(contextId)!;
        const state = agent.getState();
        const artifacts = state.artifacts ?? [];

        const { artifactsListEmbed } = await import("./formatters/embed-builder.js");
        const embed = artifactsListEmbed(artifacts);
        await interaction.reply({ embeds: [embed] });
    }
}
