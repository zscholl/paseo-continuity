import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { describe, expect, it } from "vitest";
import { LABEL } from "../shared/labels";
import {
  buildNotionFileReminder,
  buildNotionSection,
  extractNotionContext,
  notionLabelsFromContext,
  priorNotionFromLabels,
  type NotionBoardConfig,
} from "./notion";

const SAMPLE_CONFIG: NotionBoardConfig = {
  enabled: true,
  skillUrl: "https://app.notion.com/p/00000000000000000000000000000001",
  projectsDbUrl: "https://app.notion.com/p/00000000000000000000000000000002",
  projectsDataSource: "collection://00000000-0000-0000-0000-000000000002",
  tasksDbUrl: "https://app.notion.com/p/00000000000000000000000000000003",
  tasksDataSource: "collection://00000000-0000-0000-0000-000000000003",
  decisionsDbUrl: "https://app.notion.com/p/00000000000000000000000000000004",
  decisionsDataSource: "collection://00000000-0000-0000-0000-000000000004",
  gripesDbUrl: "https://app.notion.com/p/00000000000000000000000000000005",
  gripesDataSource: "collection://00000000-0000-0000-0000-000000000005",
  ignoredUrls: ["https://app.notion.com/p/00000000000000000000000000000006"],
};

const PROJECT_URL = "https://app.notion.com/p/11111111222233334444555555555555";
const TASK_URL = "https://app.notion.com/p/aaaaaaaabbbbccccddddeeeeeeeeeeee";
const DECISION_URL = "https://www.notion.so/Auth-Strategy-99999999888877776666555555555555";

describe("extractNotionContext", () => {
  it("extracts the project URL from Notion MCP tool call relations and ignores configured DB/ignored URLs", () => {
    const timeline: AgentTimelineItem[] = [
      {
        type: "tool_call",
        callId: "1",
        name: "notion-fetch",
        status: "completed",
        error: null,
        detail: {
          type: "unknown",
          input: { id: SAMPLE_CONFIG.projectsDbUrl },
          output: {
            url: `${SAMPLE_CONFIG.projectsDbUrl}?pvs=204`,
            guide: SAMPLE_CONFIG.ignoredUrls?.[0],
          },
        },
      },
      {
        type: "tool_call",
        callId: "2",
        name: "notion-create-pages",
        status: "completed",
        error: null,
        detail: {
          type: "unknown",
          input: {
            parent: { data_source_id: "00000000-0000-0000-0000-000000000003" },
            pages: [{ properties: { Name: "Implement OAuth", Project: `${PROJECT_URL}?pvs=204` } }],
          },
          output: { pages: [{ url: `${TASK_URL}?pvs=204` }] },
        },
      },
      {
        type: "assistant_message",
        text: `Logged task at ${TASK_URL}?pvs=204 and recorded decision ${DECISION_URL}.`,
      },
    ];

    const context = extractNotionContext(timeline, undefined, SAMPLE_CONFIG);
    expect(context.projectUrl).toBe(PROJECT_URL);
    expect(context.referencedUrls).toEqual([TASK_URL, DECISION_URL]);
  });

  it("extracts the project URL from prose mentions and deduplicates by page ID", () => {
    const timeline: AgentTimelineItem[] = [
      {
        type: "user_message",
        text: `Work on Notion project: [Continuity](${PROJECT_URL}?pvs=204) and check ${TASK_URL}`,
      },
      {
        type: "assistant_message",
        text: `Checked https://www.notion.so/Continuity-11111111222233334444555555555555 and ${TASK_URL}?pvs=4`,
      },
    ];

    const context = extractNotionContext(timeline, undefined, SAMPLE_CONFIG);
    expect(context.projectUrl).toBe(PROJECT_URL);
    expect(context.referencedUrls).toEqual([TASK_URL]);
  });

  it("carries prior Notion labels forward across multi-hop failovers", () => {
    const prior = priorNotionFromLabels({
      [LABEL.notionProject]: PROJECT_URL,
      [LABEL.notionUrls]: `${TASK_URL},${DECISION_URL}`,
    });

    const context = extractNotionContext([{ type: "user_message", text: "Keep going" }], prior, SAMPLE_CONFIG);
    expect(context.projectUrl).toBe(PROJECT_URL);
    expect(context.referencedUrls).toEqual([TASK_URL, DECISION_URL]);

    const labels = notionLabelsFromContext(context);
    expect(labels[LABEL.notionProject]).toBe(PROJECT_URL);
    expect(labels[LABEL.notionUrls]).toBe(`${TASK_URL},${DECISION_URL}`);
  });
});

describe("buildNotionSection", () => {
  it("pins the detected project URL, referenced pages, and configured database locations", () => {
    const section = buildNotionSection({ projectUrl: PROJECT_URL, referencedUrls: [TASK_URL] }, SAMPLE_CONFIG);
    expect(section).toContain("## Notion project board");
    expect(section).toContain(`Associated Notion project:** ${PROJECT_URL}`);
    expect(section).toContain(TASK_URL);
    expect(section).toContain(SAMPLE_CONFIG.tasksDataSource!);
    expect(section).toContain(SAMPLE_CONFIG.decisionsDataSource!);
    expect(section).toContain(SAMPLE_CONFIG.skillUrl!);
  });

  it("works cleanly without configured database URLs", () => {
    const section = buildNotionSection({ projectUrl: null, referencedUrls: [] });
    expect(section).toContain("## Notion project board");
    expect(section).toContain("Search **Agent Projects** for the project");
    expect(section).toContain("Do not create a duplicate project");
  });

  it("includes configured Agent Projects URL and data source when no project URL was detected", () => {
    const section = buildNotionSection({ projectUrl: null, referencedUrls: [] }, SAMPLE_CONFIG);
    expect(section).toContain(SAMPLE_CONFIG.projectsDbUrl!);
    expect(section).toContain(SAMPLE_CONFIG.projectsDataSource!);
  });
});

describe("buildNotionFileReminder", () => {
  it("mentions the detected project URL when available", () => {
    const reminder = buildNotionFileReminder({ projectUrl: PROJECT_URL, referencedUrls: [] }, SAMPLE_CONFIG);
    expect(reminder).toContain(PROJECT_URL);
    expect(reminder).toContain("same project");
  });

  it("falls back to Agent Projects (with configured URL when set) when no project URL is known", () => {
    const withUrl = buildNotionFileReminder({ projectUrl: null, referencedUrls: [] }, SAMPLE_CONFIG);
    expect(withUrl).toContain(SAMPLE_CONFIG.projectsDbUrl!);

    const withoutUrl = buildNotionFileReminder({ projectUrl: null, referencedUrls: [] });
    expect(withoutUrl).toContain("Agent Projects for the original task's project");
  });
});
