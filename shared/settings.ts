import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const ChainEntrySchema = z.object({
  /** Paseo provider ID, e.g. "codex", "claude", "opencode". */
  provider: z.string().min(1),
  /** Model ID for that provider; null resolves the provider's default model. */
  model: z.string().min(1).nullable().default(null),
  /** Provider mode for the successor; null keeps the provider default. */
  modeId: z.string().min(1).nullable().default(null),
  thinkingOptionId: z.string().min(1).nullable().default(null),
});

export type ChainEntry = z.output<typeof ChainEntrySchema>;

export const ContextModeSchema = z.enum(["automatic", "full"]);
export type ContextMode = z.output<typeof ContextModeSchema>;

export const NotionProjectBoardSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  /** Optional Notion URL of your Project Management skill page. */
  skillUrl: z.string().default(""),
  /** Optional Agent Projects database URL and data source (`collection://...`). */
  projectsDbUrl: z.string().default(""),
  projectsDataSource: z.string().default(""),
  /** Optional Agent Tasks database URL and data source (`collection://...`). */
  tasksDbUrl: z.string().default(""),
  tasksDataSource: z.string().default(""),
  /** Optional Agent Decisions database URL and data source (`collection://...`). */
  decisionsDbUrl: z.string().default(""),
  decisionsDataSource: z.string().default(""),
  /** Optional Agent Gripes database URL and data source (`collection://...`). */
  gripesDbUrl: z.string().default(""),
  gripesDataSource: z.string().default(""),
  /** Optional Notion page/database URLs to ignore when detecting per-project pages. */
  ignoredUrls: z.array(z.string()).default([]),
});

export type NotionProjectBoardSettings = z.output<typeof NotionProjectBoardSettingsSchema>;

export const DEFAULT_NOTION_SETTINGS: NotionProjectBoardSettings =
  NotionProjectBoardSettingsSchema.parse({});

export const ContinuitySettingsSchema = z.object({
  enabled: z.boolean().default(true),
  triggers: z
    .object({
      quota: z.boolean().default(true),
      rateLimit: z.boolean().default(true),
      overloaded: z.boolean().default(false),
    })
    .default({ quota: true, rateLimit: true, overloaded: false }),
  chain: z.array(ChainEntrySchema).default([
    { provider: "codex", model: null, modeId: "auto", thinkingOptionId: null },
    { provider: "claude", model: null, modeId: "default", thinkingOptionId: null },
  ]),
  contextMode: ContextModeSchema.default("automatic"),
  budgets: z
    .object({
      automaticChars: z.number().int().min(4_000).max(400_000).default(60_000),
      fullChars: z.number().int().min(4_000).max(400_000).default(200_000),
    })
    .default({ automaticChars: 60_000, fullChars: 200_000 }),
  /** Optionally condenses the transcript with a separate (cheap or local) model before handoff. */
  summary: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.string().min(1).nullable().default(null),
      model: z.string().min(1).nullable().default(null),
      inputChars: z.number().int().min(4_000).max(400_000).default(30_000),
      timeoutSeconds: z.number().int().min(10).max(900).default(180),
    })
    .default({ enabled: false, provider: null, model: null, inputChars: 30_000, timeoutSeconds: 180 }),
  maxSwitchesPerChain: z.number().int().min(1).max(20).default(3),
  maxConsecutiveFailovers: z.number().int().min(1).max(20).default(2),
  cooldownMinutes: z
    .object({
      quota: z.number().min(0).max(24 * 60).default(60),
      rateLimit: z.number().min(0).max(24 * 60).default(5),
    })
    .default({ quota: 60, rateLimit: 5 }),
  includeSubagents: z.boolean().default(false),
  titleBadges: z.boolean().default(true),
  showComposerPill: z.boolean().default(true),
  /** The composer pill warns and offers a compacted handoff at or below this remaining quota. */
  warnAtRemainingPct: z.number().min(1).max(90).default(15),
  /** Instructs successor agents to pick up and log tasks on the original task's Notion project board. */
  notionProjectBoard: NotionProjectBoardSettingsSchema.default(DEFAULT_NOTION_SETTINGS),
});

export type ContinuitySettings = z.output<typeof ContinuitySettingsSchema>;

export const continuitySettings = defineSettings({
  id: "config",
  scope: "host",
  version: 1,
  schema: ContinuitySettingsSchema,
});

export const DEFAULT_SETTINGS: ContinuitySettings = ContinuitySettingsSchema.parse({});
