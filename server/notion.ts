import type { AgentTimelineItem, ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { LABEL } from "../shared/labels";
import { DEFAULT_NOTION_SETTINGS, type NotionProjectBoardSettings } from "../shared/settings";

const MAX_REFERENCED_URLS = 10;
const MAX_LABEL_URLS = 5;

export interface NotionProjectContext {
  /** Best-match Notion project page URL from labels or timeline, if detected. */
  projectUrl: string | null;
  /** Other non-static Notion page URLs (tasks, decisions, project pages) seen in the session. */
  referencedUrls: string[];
}

export interface PriorNotionLabels {
  projectUrl?: string | null;
  urls?: readonly string[];
}

export type NotionBoardConfig = Partial<NotionProjectBoardSettings>;

const NOTION_URL_RE = /https:\/\/(?:app\.notion\.com|www\.notion\.so|notion\.so)\/[^\s<>"'`)\]},;]+/gi;

const PROJECT_RELATION_JSON_RE =
  /"Project"\s*:\s*(?:\[\s*)?"(https:\/\/(?:app\.notion\.com|www\.notion\.so|notion\.so)\/[^"]+)"/gi;

const PROJECT_PROSE_RE =
  /(?:associated\s+)?(?:notion\s+)?project(?:\s+(?:page|board|url))?\s*[:\-]\s*(?:\[[^\]]*\]\()?(https:\/\/(?:app\.notion\.com|www\.notion\.so|notion\.so)\/[^\s<>"'`)\]},;]+)/gi;

export const NOTION_SUMMARY_INSTRUCTION =
  "Preserve any associated Notion project (name and URL), linked Notion task(s) (titles, URLs, statuses), and relevant decisions or gripes so the successor keeps tracking work on the same Notion project board.";

/** Extracts Notion page IDs and the associated Notion project URL from labels and timeline items. */
export function extractNotionContext(
  timeline: readonly AgentTimelineItem[],
  prior?: PriorNotionLabels,
  config?: NotionBoardConfig,
): NotionProjectContext {
  const ignoredIds = ignoredIdsFromConfig(config);
  const byId = new Map<string, string>();
  let projectUrl: string | null = null;

  const rememberUrl = (raw: string): string | null => {
    const normalized = normalizeNotionUrl(raw);
    if (!normalized) return null;
    if (ignoredIds.has(normalized.id)) return null;
    if (!byId.has(normalized.id)) {
      byId.set(normalized.id, normalized.url);
    }
    return byId.get(normalized.id)!;
  };

  const rememberProject = (raw: string | null | undefined) => {
    if (!raw || projectUrl) return;
    const canonical = rememberUrl(raw);
    if (canonical) {
      projectUrl = canonical;
    }
  };

  if (prior?.projectUrl) {
    rememberProject(prior.projectUrl);
  }
  for (const url of prior?.urls ?? []) {
    rememberUrl(url);
  }

  for (const item of timeline) {
    for (const chunk of textChunksOf(item)) {
      scanChunk(chunk, rememberProject, rememberUrl);
    }
  }

  const projectId = projectUrl ? extractPageId(projectUrl) : null;
  const referencedUrls: string[] = [];
  for (const [id, url] of byId) {
    if (id === projectId) continue;
    referencedUrls.push(url);
    if (referencedUrls.length >= MAX_REFERENCED_URLS) break;
  }

  return { projectUrl, referencedUrls };
}

/** Reads previously carried Notion project context from Paseo agent labels. */
export function priorNotionFromLabels(
  labels: Readonly<Record<string, string>> | null | undefined,
): PriorNotionLabels {
  if (!labels) return {};
  const projectUrl = labels[LABEL.notionProject]?.trim() || null;
  const rawUrls = labels[LABEL.notionUrls]?.trim();
  const urls = rawUrls
    ? rawUrls
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
  return { projectUrl, urls };
}

/** Serializes detected Notion context into compact agent labels for multi-hop failover chains. */
export function notionLabelsFromContext(context: NotionProjectContext): Record<string, string> {
  const labels: Record<string, string> = {};
  if (context.projectUrl) {
    labels[LABEL.notionProject] = context.projectUrl;
  }
  if (context.referencedUrls.length > 0) {
    labels[LABEL.notionUrls] = context.referencedUrls.slice(0, MAX_LABEL_URLS).join(",");
  }
  return labels;
}

/** Builds the `## Notion project board` handoff section aligned with the Project Management skill. */
export function buildNotionSection(
  context: NotionProjectContext,
  config?: NotionBoardConfig,
): string {
  const settings: NotionProjectBoardSettings = { ...DEFAULT_NOTION_SETTINGS, ...config };
  const skillRef = formatRef(settings.skillUrl);
  const projectsRef = formatRef(settings.projectsDbUrl, settings.projectsDataSource);
  const tasksRef = formatRef(settings.tasksDbUrl, settings.tasksDataSource, "relation **Project**");
  const decisionsRef = formatRef(settings.decisionsDbUrl, settings.decisionsDataSource);
  const gripesRef = formatRef(settings.gripesDbUrl, settings.gripesDataSource);

  const lines: string[] = [
    "## Notion project board",
    "",
    `Follow the Notion **Project Management** skill${skillRef} and continue tracking work on the **same Notion project** the original task was using:`,
    "",
  ];

  if (context.projectUrl) {
    lines.push(`- **Associated Notion project:** ${context.projectUrl}`);
  } else {
    lines.push(
      `- **Locate the existing project first:** Search **Agent Projects**${projectsRef} for the project matching the original task or repository and reuse it. Do not create a duplicate project. (Honor if the user explicitly opted out of Notion tracking or the request is trivial.)`,
    );
  }

  if (context.referencedUrls.length > 0) {
    lines.push("- **Notion pages referenced in the prior session:**");
    for (const url of context.referencedUrls) {
      lines.push(`  - ${url}`);
    }
  }

  lines.push(
    `- **Pick up work from the project board:** Inspect the project's linked tasks in **Agent Tasks**${tasksRef} and linked **Agent Decisions**${decisionsRef} before acting. Resume the active (\`In progress\`) task or pick up the next unblocked task (respecting **Dependencies**) rather than duplicating work.`,
    "- **Log new tasks under the same project:** Search the project's linked tasks first; reuse and update matching tasks. Log any new meaningful work or follow-ups as distinct, actionable tasks in **Agent Tasks** linked to the same **Project** (and set **Dependencies** where known).",
    `- **Keep task records and statuses current:** Maintain **Purpose**, **Definition of done**, **Testing and verification** (explicit pending/passed/failed/not applicable states — never claim a check passed without running or verifying it), **Pull requests**, and **Progress and context** in each task body. Keep **Status** accurate (\`Draft\`, \`In progress\`, \`Waiting verification\`, \`Waiting on approval\`, \`Done\`), add progress/blocker comments as needed, log consequential choices in **Agent Decisions** (linked to the same **Project**), and log recurring friction/blockers in **Agent Gripes**${gripesRef}.`,
  );

  return lines.join("\n");
}

/** Concise Notion reminder for the file-based handoff opening prompt (`Compact & move`). */
export function buildNotionFileReminder(
  context: NotionProjectContext,
  config?: NotionBoardConfig,
): string {
  if (context.projectUrl) {
    return `Check the associated Notion project board (${context.projectUrl}) to pick up active/unblocked tasks and log any new tasks under that same project following the Notion Project Management skill.`;
  }
  const projectsRef = formatRef(config?.projectsDbUrl);
  return `Check the associated Notion project board in Agent Projects${projectsRef} for the original task's project to pick up active/unblocked tasks and log any new tasks under that same project following the Notion Project Management skill.`;
}

function formatRef(url?: string, dataSource?: string, extra?: string): string {
  const parts: string[] = [];
  const trimmedUrl = url?.trim();
  const trimmedSource = dataSource?.trim();
  if (trimmedUrl) parts.push(trimmedUrl);
  if (trimmedSource) parts.push(`data source \`${trimmedSource}\``);
  if (extra) parts.push(extra);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function ignoredIdsFromConfig(config?: NotionBoardConfig): Set<string> {
  const ids = new Set<string>();
  if (!config) return ids;
  const candidates = [
    config.skillUrl,
    config.projectsDbUrl,
    config.tasksDbUrl,
    config.decisionsDbUrl,
    config.gripesDbUrl,
    ...(config.ignoredUrls ?? []),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const id = extractPageId(candidate);
    if (id) ids.add(id);
  }
  return ids;
}

function scanChunk(
  chunk: string,
  rememberProject: (url: string) => void,
  rememberUrl: (url: string) => string | null,
): void {
  if (!chunk.includes("notion.com") && !chunk.includes("notion.so")) {
    return;
  }
  for (const match of chunk.matchAll(PROJECT_RELATION_JSON_RE)) {
    if (match[1]) rememberProject(match[1]);
  }
  for (const match of chunk.matchAll(PROJECT_PROSE_RE)) {
    if (match[1]) rememberProject(match[1]);
  }
  for (const match of chunk.matchAll(NOTION_URL_RE)) {
    rememberUrl(match[0]);
  }
}

function textChunksOf(item: AgentTimelineItem): string[] {
  switch (item.type) {
    case "user_message":
    case "assistant_message":
      return [item.text];
    case "tool_call":
      return toolDetailChunks(item.detail);
    case "error":
    case "notification":
      return [item.message];
    case "reasoning":
    case "todo":
    case "compaction":
    case "plugin":
      return [];
  }
}

function toolDetailChunks(detail: ToolCallDetail): string[] {
  switch (detail.type) {
    case "unknown": {
      const chunks: string[] = [];
      if (detail.input !== undefined) chunks.push(safeStringify(detail.input));
      if (detail.output !== undefined) chunks.push(safeStringify(detail.output));
      return chunks;
    }
    case "fetch":
      return [detail.url, detail.result ?? ""].filter(Boolean);
    case "plain_text":
      return [detail.label ?? "", detail.text ?? ""].filter(Boolean);
    case "plan":
      return [detail.text];
    case "shell":
      return [detail.command, detail.output ?? ""].filter(Boolean);
    case "read":
    case "edit":
    case "write":
    case "search":
    case "worktree_setup":
    case "sub_agent":
      return [];
  }
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function normalizeNotionUrl(raw: string): { id: string; url: string } | null {
  const cleaned = raw.replace(/[.,;:'")\]>]+$/g, "");
  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "app.notion.com" && host !== "www.notion.so" && host !== "notion.so") {
    return null;
  }
  const id = extractPageId(parsed.pathname);
  if (!id) return null;
  return { id, url: `${parsed.origin}${parsed.pathname}` };
}

function extractPageId(pathOrUrl: string): string | null {
  const hyphenated = pathOrUrl.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:$|[/?#])/i,
  );
  if (hyphenated?.[1]) {
    return hyphenated[1].replace(/-/g, "").toLowerCase();
  }
  const compact = pathOrUrl.match(/([0-9a-f]{32})(?:$|[/?#])/i);
  if (compact?.[1]) {
    return compact[1].toLowerCase();
  }
  return null;
}
