// ============================================================================
// ZEN AI Discord Bot — /zen command definitions & run handler
// ============================================================================

import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
} from "discord.js";
import { ZenAgent } from "@zen-ai/core";
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
    );

/** Handle /zen run <goal>. */
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

    const config = createAgentConfig(goal, maxSteps);
    const agent = new ZenAgent(config);
    agents.set(contextId, agent);

    // Send messages to the same channel (or DM)
    const send = async (text: string) => {
        try {
            const ch = interaction.channel;
            if (ch && "send" in ch) {
                await ch.send(text);
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

    agent.on("context:reset", () => {
        send("🔄 コンテキストリセットしたよ、続けるね");
    });

    await interaction.followUp(`🧘 「${goal}」に取り掛かるよ`);

    try {
        await agent.run();
        const state = agent.getState();
        const progress = state.delta ? `${Math.round(state.delta.progress * 100)}%` : "完了";
        await send(`✅ 終わったよ。${state.stepCount}ステップ、進捗 ${progress}`);
    } catch (error) {
        await send(`💥 エラーで止まった: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        agents.delete(contextId);
    }
}
