// ============================================================================
// ZEN AI Discord Bot — /zen command definitions & run handler
// ============================================================================

import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    TextBasedChannel,
} from "discord.js";
import { ZenAgent } from "@zen-ai/core";
import { existsSync } from "node:fs";
import type { ZenAgentConfig } from "@zen-ai/core";

/** Command definition for /zen. */
export const zenRunCommand = new SlashCommandBuilder()
    .setName("zen")
    .setDescription("ZEN AI Agent Commands")
    .addSubcommand((sub) =>
        sub
            .setName("run")
            .setDescription("Start an agent with a goal")
            .addStringOption((opt) =>
                opt
                    .setName("goal")
                    .setDescription("The goal for the agent to accomplish")
                    .setRequired(true),
            )
            .addIntegerOption((opt) =>
                opt
                    .setName("max_steps")
                    .setDescription("Maximum steps (default: 30)")
                    .setMinValue(1)
                    .setMaxValue(100)
                    .setRequired(false),
            ),
    )
    .addSubcommand((sub) =>
        sub.setName("stop").setDescription("Stop the running agent"),
    )
    .addSubcommand((sub) =>
        sub.setName("status").setDescription("Show the current agent status"),
    )
    .addSubcommand((sub) =>
        sub.setName("pause").setDescription("Pause the running agent"),
    )
    .addSubcommand((sub) =>
        sub
            .setName("ask")
            .setDescription("Ask the running agent a question")
            .addStringOption((opt) =>
                opt
                    .setName("question")
                    .setDescription("Your question")
                    .setRequired(true),
            ),
    )
    .addSubcommand((sub) =>
        sub.setName("skills").setDescription("List learned skills"),
    )
    .addSubcommand((sub) =>
        sub.setName("failures").setDescription("List recorded failure knowledge"),
    )
    .addSubcommand((sub) =>
        sub.setName("artifacts").setDescription("List deliverables produced by the agent"),
    );

export async function handleZenRun(
    interaction: ChatInputCommandInteraction,
    agents: Map<string, ZenAgent>,
    createAgentConfig: (goal: string, maxSteps: number) => ZenAgentConfig,
): Promise<void> {
    const contextId = interaction.guildId ?? interaction.user.id;

    if (agents.has(contextId)) {
        await interaction.reply({
            content: "もうエージェント動いてるよ。先に /zen stop してね。",
            ephemeral: true,
        });
        return;
    }

    const goal = interaction.options.getString("goal", true);
    const maxSteps = interaction.options.getInteger("max_steps") ?? 30;

    await interaction.deferReply();
    const channel = interaction.channel;

    if (!channel || !("send" in channel)) {
        await interaction.editReply("エラー: このチャンネルでは実行できません（TextBasedChannelが必要です）。");
        return;
    }

    await interaction.editReply(`**起動**: 「${goal}」`);

    // Delegate to shared runner
    await runZenAgent(
        goal,
        agents,
        createAgentConfig,
        channel as TextBasedChannel,
        contextId,
        maxSteps
    );
}

/**
 * Shared logic to run a ZenAgent in a channel.
 * Can be called from Slash Command or DM logic.
 */
export async function runZenAgent(
    goal: string,
    agents: Map<string, ZenAgent>,
    createAgentConfig: (goal: string, maxSteps: number) => ZenAgentConfig,
    channel: TextBasedChannel,
    contextId: string,
    maxSteps: number = 30
): Promise<void> {
    // Check if agent exists (redundant if called from handleZenRun, but good for safety)
    if (agents.has(contextId)) {
        if ("send" in channel) {
            await (channel as any).send("もうエージェント動いてるよ。先に /zen stop してね。");
        }
        return;
    }

    const config = createAgentConfig(goal, maxSteps);
    const agent = new ZenAgent(config);
    agents.set(contextId, agent);

    // Helper to send messages to the channel
    const send = async (text: string) => {
        try {
            if ("send" in channel) {
                await (channel as any).send(text);
            }
        } catch {
            // ignore permission errors in read-only channels
        }
    };

    agent.on("agent:start", ({ goal: g }) => {
        send(`🧘 了解、「${typeof g === "string" ? g : g.description}」に取り掛かるよ`);
    });

    agent.on("milestone:reached", ({ milestoneId }) => {
        send(`✅ マイルストーン「${milestoneId}」達成。次いくね`);
    });

    agent.on("action:complete", ({ action, result, step }) => {
        if (step % 3 === 0 || !result.success) {
            const status = result.success ? "👍" : "⚠️ 失敗";
            send(`${status} Step ${step}: ${action.toolName}`);
        }
    });

    agent.on("failure:recorded", ({ proverb, condition }) => {
        send(`📝 学んだ: "${proverb}" — ${condition}`);
    });

    // --- Buddhist AI event handlers ---
    agent.on("karma:stored", ({ karmaType, causalChain }) => {
        const chainStr = causalChain.length > 0 ? ` (因果: ${causalChain.join(" → ")})` : "";
        send(`☸️ 業を記録: ${karmaType}${chainStr}`);
    });

    agent.on("tanha:loop:detected", ({ pattern }) => {
        send(`⚠️ 渇愛ループ検出: "${pattern}" — 執着を手放し、別のアプローチを模索中`);
    });

    agent.on("dukkha:evaluated", ({ sufferingDelta, egoNoise }) => {
        if (sufferingDelta != null && sufferingDelta > 0.5) {
            send(`🧘 苦レベル高: ${sufferingDelta.toFixed(2)} / Ego: ${(egoNoise ?? 0).toFixed(2)}`);
        }
    });

    agent.on("awakening:stage", ({ stage, confidence }) => {
        if (stage === "equanimity") {
            send(`🪷 覚醒判断完了 (confidence: ${(confidence ?? 0).toFixed(2)})`);
        }
    });

    agent.on("artifact:created", ({ toolName, step, filePath, description }) => {
        const text = `📦 成果物生成: Step ${step} — \`${toolName}\``;

        if (filePath && existsSync(filePath)) {
            // Attempt to send file attachment
            // @ts-ignore - channel is TextBasedChannel
            if ("send" in channel) {
                (channel as any).send({
                    content: text,
                    files: [filePath]
                }).catch((err: any) => {
                    send(`${text}\n(File upload failed: ${err.message})`);
                });
                return;
            }
        }

        send(text);
    });

    // Report cost
    agent.on("agent:complete", ({ cost, usage }) => {
        send(`💰 Cost: $${cost.toFixed(6)} (In: ${usage.promptTokens}, Out: ${usage.completionTokens})`);
    });

    try {
        await agent.run();
        const state = agent.getState();
        const progress = state.delta ? `${Math.round(state.delta.progress * 100)}%` : "完了";
        const artifactCount = state.artifacts?.length ?? 0;
        const artifactSummary = artifactCount > 0
            ? `\n📦 成果物: ${artifactCount}件`
            : "";
        await send(`✅ 終わったよ。${state.stepCount}ステップ、進捗 ${progress}${artifactSummary}`);
    } catch (error) {
        await send(`💥 エラーで止まった: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        agents.delete(contextId);
    }
}
