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
    type ChatInputCommandInteraction,
} from "discord.js";
import { ZenAgent } from "@zen-ai/core";
import type { ZenAgentConfig, Tool, LLMAdapter } from "@zen-ai/core";
import { OpenAIAdapter } from "@zen-ai/adapter-openai";
import type { OpenAIAdapterConfig } from "@zen-ai/adapter-openai";
import { SkillDB, FailureKnowledgeDB } from "@zen-ai/memory";
import { fileReadTool, fileWriteTool, httpTool } from "@zen-ai/tools";
import { zenRunCommand, handleZenRun } from "./commands/zen-commands.js";

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
    private llmAdapters: Map<string, LLMAdapter> = new Map();
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
            ],
            partials: [Partials.Channel],
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

        const tools: Tool[] = [
            fileReadTool,
            fileWriteTool,
            httpTool,
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
}
