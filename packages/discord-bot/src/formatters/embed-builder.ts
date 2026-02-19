// ============================================================================
// ZEN AI Discord Bot — Embed Formatters
// Convert agent events into beautiful Discord Embeds.
// ============================================================================

import { EmbedBuilder } from "discord.js";
import type { Goal, Delta, Milestone, Artifact } from "@zen-ai/core";

/** Colors for different event types. */
const COLORS = {
    start: 0x7c3aed, // Purple
    milestone: 0x22c55e, // Green
    action: 0x3b82f6, // Blue
    failure: 0xef4444, // Red
    complete: 0xf59e0b, // Amber
    reset: 0x06b6d4, // Cyan
    error: 0xdc2626, // Dark Red
} as const;

/** Create an embed for agent start. */
export function agentStartEmbed(goal: Goal): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle("🧘 ZEN AI Agent Starting")
        .setDescription(goal.description)
        .setColor(COLORS.start)
        .setTimestamp()
        .setFooter({ text: "Don't accumulate. Perceive now." });
}

/** Create an embed for milestone reached. */
export function milestoneReachedEmbed(
    milestoneId: string,
    milestone?: Milestone,
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle("✅ Milestone Reached")
        .setColor(COLORS.milestone)
        .addFields({ name: "Milestone", value: milestoneId, inline: true })
        .setTimestamp();

    if (milestone?.description) {
        embed.setDescription(milestone.description);
    }

    return embed;
}

/** Create an embed for action completion. */
export function actionCompleteEmbed(
    toolName: string,
    success: boolean,
    step: number,
    output?: string,
): EmbedBuilder {
    const icon = success ? "✅" : "❌";
    const embed = new EmbedBuilder()
        .setTitle(`${icon} Step ${step}: ${toolName}`)
        .setColor(success ? COLORS.action : COLORS.failure)
        .setTimestamp();

    if (output) {
        // Truncate output for Discord (max 4096 chars in description)
        const truncated =
            output.length > 200 ? output.slice(0, 200) + "..." : output;
        embed.setDescription(`\`\`\`\n${truncated}\n\`\`\``);
    }

    return embed;
}

/** Create an embed for failure recorded. */
export function failureRecordedEmbed(
    proverb: string,
    condition: string,
    severity: string,
): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle("💀 Failure Recorded")
        .setColor(COLORS.failure)
        .addFields(
            { name: "Proverb", value: proverb },
            { name: "Condition", value: condition, inline: true },
            { name: "Severity", value: severity, inline: true },
        )
        .setTimestamp();
}

/** Create an embed for context reset. */
export function contextResetEmbed(
    milestoneId: string,
    failureCount: number,
): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle("🔄 Context Reset")
        .setDescription(
            `Milestone **${milestoneId}** completed. Chat history cleared.`,
        )
        .setColor(COLORS.reset)
        .addFields({
            name: "Failures Preserved",
            value: `${failureCount} proverb(s) carried forward`,
            inline: true,
        })
        .setTimestamp();
}

/** Create an embed for agent completion. */
export function agentCompleteEmbed(
    goal: Goal,
    steps: number,
    delta?: Delta,
    artifacts?: Artifact[],
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle("🧘 Agent Complete")
        .setDescription(goal.description)
        .setColor(COLORS.complete)
        .addFields(
            {
                name: "Total Steps",
                value: String(steps),
                inline: true,
            },
            {
                name: "Progress",
                value: delta?.progress
                    ? `${(delta.progress * 100).toFixed(0)}%`
                    : "N/A",
                inline: true,
            },
        )
        .setTimestamp()
        .setFooter({ text: "Don't accumulate. Perceive now." });

    if (delta?.gaps?.length) {
        embed.addFields({
            name: "Remaining Gaps",
            value: delta.gaps.join("\n"),
        });
    }

    if (artifacts && artifacts.length > 0) {
        const list = artifacts
            .slice(0, 10)
            .map((a, i) => `**${i + 1}.** \`${a.toolName}\` — ${a.description}`)
            .join("\n");
        embed.addFields({
            name: `📦 成果物 (${artifacts.length}件)`,
            value: list.length > 1024 ? list.slice(0, 1021) + "..." : list,
        });
    }

    return embed;
}

/** Create an embed for agent status with Buddhist AI metrics. */
export function agentStatusEmbed(state: {
    goal: Goal;
    stepCount: number;
    delta?: Delta;
    currentMilestoneIndex?: number;
    running: boolean;
    buddhistMetrics?: {
        sufferingDelta?: number;
        egoNoise?: number;
        tanhaLoopDetected: boolean;
        karmaCount: number;
        userInstructionCount: number;
    };
}): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle("📊 Agent Status")
        .setColor(state.running ? COLORS.action : COLORS.reset)
        .addFields(
            { name: "Goal", value: state.goal.description },
            {
                name: "Status",
                value: state.running ? "🟢 Running" : "⚪ Idle",
                inline: true,
            },
            { name: "Steps", value: String(state.stepCount), inline: true },
            {
                name: "Milestone",
                value: String(state.currentMilestoneIndex ?? 0),
                inline: true,
            },
            {
                name: "Progress",
                value: state.delta?.progress
                    ? `${(state.delta.progress * 100).toFixed(0)}%`
                    : "N/A",
                inline: true,
            },
        )
        .setTimestamp();

    // --- Buddhist AI Metrics ---
    if (state.buddhistMetrics) {
        const m = state.buddhistMetrics;
        const sufferingBar = makeSufferingBar(m.sufferingDelta);
        const egoBar = makeSufferingBar(m.egoNoise);

        embed.addFields(
            {
                name: "🧘 苦 (Suffering)",
                value: m.sufferingDelta != null
                    ? `${sufferingBar} ${m.sufferingDelta.toFixed(2)}`
                    : "計測中...",
                inline: true,
            },
            {
                name: "👁️ 我執 (Ego)",
                value: m.egoNoise != null
                    ? `${egoBar} ${m.egoNoise.toFixed(2)}`
                    : "計測中...",
                inline: true,
            },
            {
                name: "🔄 渇愛ループ",
                value: m.tanhaLoopDetected ? "⚠️ 検出" : "✅ 正常",
                inline: true,
            },
            {
                name: "☸️ 業 (Karma)",
                value: `${m.karmaCount} entries`,
                inline: true,
            },
            {
                name: "📝 指示回数",
                value: `${m.userInstructionCount}回`,
                inline: true,
            },
        );

        embed.setFooter({
            text: m.tanhaLoopDetected
                ? "⚠️ Tanha Loop detected — 同じ失敗を繰り返している"
                : "苦を観察し、執着を手放し、覚醒へ",
        });
    } else {
        embed.setFooter({ text: "Don't accumulate. Perceive now." });
    }

    return embed;
}

/** Create a visual bar for suffering / ego levels. */
function makeSufferingBar(value?: number): string {
    if (value == null) return "░░░░░░░░░░";
    const clamped = Math.max(0, Math.min(1, value));
    const filled = Math.round(clamped * 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
}

/** Create an error embed. */
export function errorEmbed(message: string): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle("❌ Error")
        .setDescription(message)
        .setColor(COLORS.error)
        .setTimestamp();
}

/** Create an embed for agent paused. */
export function agentPausedEmbed(goal: Goal, step: number): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle("⏸️ Agent Paused")
        .setDescription(goal.description)
        .setColor(COLORS.reset)
        .addFields(
            { name: "Stopped at Step", value: String(step), inline: true },
            { name: "Status", value: "🟡 Paused", inline: true },
        )
        .setTimestamp()
        .setFooter({ text: "Use /zen run to start a new agent." });
}

/** Create an embed for skills list. */
export function skillsListEmbed(
    skills: { id: string; description: string }[],
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle("🧠 Learned Skills")
        .setColor(COLORS.milestone)
        .setTimestamp();

    if (skills.length === 0) {
        embed.setDescription("No skills learned yet.");
    } else {
        const list = skills
            .slice(0, 20)
            .map((s, i) => `**${i + 1}.** \`${s.id}\` — ${s.description}`)
            .join("\n");
        embed.setDescription(list);
        if (skills.length > 20) {
            embed.setFooter({
                text: `Showing 20 of ${skills.length} skills`,
            });
        }
    }

    return embed;
}

/** Create an embed for failures list. */
export function failuresListEmbed(
    failures: { proverb: string; condition: string }[],
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle("💀 Failure Knowledge")
        .setColor(COLORS.failure)
        .setTimestamp();

    if (failures.length === 0) {
        embed.setDescription("No failures recorded yet.");
    } else {
        const list = failures
            .slice(0, 15)
            .map(
                (f, i) =>
                    `**${i + 1}.** 📜 *"${f.proverb}"*\n   └ Condition: ${f.condition}`,
            )
            .join("\n");
        embed.setDescription(list);
        if (failures.length > 15) {
            embed.setFooter({
                text: `Showing 15 of ${failures.length} failures`,
            });
        }
    }

    return embed;
}

/** Create an embed for ask response. */
export function askResponseEmbed(
    question: string,
    answer: string,
): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle("💬 Agent Response")
        .setColor(COLORS.action)
        .addFields(
            { name: "Question", value: question },
            {
                name: "Answer",
                value:
                    answer.length > 1024
                        ? answer.slice(0, 1021) + "..."
                        : answer,
            },
        )
        .setTimestamp();
}

/** Create an embed for artifacts (deliverables) list. */
export function artifactsListEmbed(
    artifacts: Artifact[],
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle("📦 成果物 (Artifacts)")
        .setColor(COLORS.complete)
        .setTimestamp();

    if (artifacts.length === 0) {
        embed.setDescription("まだ成果物ないよ");
    } else {
        const list = artifacts
            .slice(0, 15)
            .map(
                (a, i) =>
                    `**${i + 1}.** \`${a.toolName}\` (Step ${a.step})\n   └ ${a.description}`,
            )
            .join("\n");
        embed.setDescription(list);
        if (artifacts.length > 15) {
            embed.setFooter({
                text: `15件中 ${artifacts.length}件を表示`,
            });
        } else {
            embed.setFooter({
                text: `${artifacts.length}件の成果物`,
            });
        }
    }

    return embed;
}

