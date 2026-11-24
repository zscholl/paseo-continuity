import { SettingsAction, SettingsInput, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import type { ContinuitySettings, NotionProjectBoardSettings } from "../shared/settings";

interface Props {
  values: ContinuitySettings;
  save: (next: ContinuitySettings) => void;
}

type NotionTextKey =
  | "skillUrl"
  | "projectsDbUrl"
  | "projectsDataSource"
  | "tasksDbUrl"
  | "tasksDataSource"
  | "decisionsDbUrl"
  | "decisionsDataSource"
  | "gripesDbUrl"
  | "gripesDataSource";

const TEXT_FIELDS: ReadonlyArray<{
  key: NotionTextKey;
  label: string;
  hint: string;
  placeholder: string;
}> = [
  {
    key: "skillUrl",
    label: "Project Management skill URL",
    hint: "Optional link to your Notion Project Management skill page.",
    placeholder: "https://app.notion.com/p/…",
  },
  {
    key: "projectsDbUrl",
    label: "Agent Projects URL",
    hint: "Optional Notion URL for your Projects database.",
    placeholder: "https://app.notion.com/p/…",
  },
  {
    key: "projectsDataSource",
    label: "Agent Projects data source",
    hint: "Optional collection:// data source ID for Agent Projects.",
    placeholder: "collection://…",
  },
  {
    key: "tasksDbUrl",
    label: "Agent Tasks URL",
    hint: "Optional Notion URL for your Tasks database.",
    placeholder: "https://app.notion.com/p/…",
  },
  {
    key: "tasksDataSource",
    label: "Agent Tasks data source",
    hint: "Optional collection:// data source ID for Agent Tasks.",
    placeholder: "collection://…",
  },
  {
    key: "decisionsDbUrl",
    label: "Agent Decisions URL",
    hint: "Optional Notion URL for your Decisions database.",
    placeholder: "https://app.notion.com/p/…",
  },
  {
    key: "decisionsDataSource",
    label: "Agent Decisions data source",
    hint: "Optional collection:// data source ID for Agent Decisions.",
    placeholder: "collection://…",
  },
  {
    key: "gripesDbUrl",
    label: "Agent Gripes URL",
    hint: "Optional Notion URL for your Gripes database.",
    placeholder: "https://app.notion.com/p/…",
  },
  {
    key: "gripesDataSource",
    label: "Agent Gripes data source",
    hint: "Optional collection:// data source ID for Agent Gripes.",
    placeholder: "collection://…",
  },
];

/** Settings rows for Notion project board handoff instructions and optional workspace database URLs. */
export function NotionSettings({ values, save }: Props) {
  const notion = values.notionProjectBoard;
  const [draft, setDraft] = useState<NotionProjectBoardSettings>(notion);

  useEffect(() => {
    setDraft(notion);
  }, [notion]);

  const dirty = TEXT_FIELDS.some(({ key }) => draft[key].trim() !== notion[key].trim());

  const saveDraft = () => {
    const trimmed: NotionProjectBoardSettings = {
      ...notion,
      skillUrl: draft.skillUrl.trim(),
      projectsDbUrl: draft.projectsDbUrl.trim(),
      projectsDataSource: draft.projectsDataSource.trim(),
      tasksDbUrl: draft.tasksDbUrl.trim(),
      tasksDataSource: draft.tasksDataSource.trim(),
      decisionsDbUrl: draft.decisionsDbUrl.trim(),
      decisionsDataSource: draft.decisionsDataSource.trim(),
      gripesDbUrl: draft.gripesDbUrl.trim(),
      gripesDataSource: draft.gripesDataSource.trim(),
    };
    save({ ...values, notionProjectBoard: trimmed });
  };

  return (
    <>
      <SettingsSwitch
        label="Enable Notion project board instructions"
        hint="Instruct successor agents to check the original task's Notion project board to pick up, update, and log tasks."
        value={notion.enabled}
        onValueChange={(enabled) => save({ ...values, notionProjectBoard: { ...notion, enabled } })}
      />
      {notion.enabled ? (
        <>
          {TEXT_FIELDS.map(({ key, label, hint, placeholder }) => (
            <SettingsInput
              key={key}
              label={label}
              hint={hint}
              initialValue={notion[key]}
              placeholder={placeholder}
              onChangeText={(text) => setDraft((current) => ({ ...current, [key]: text }))}
            />
          ))}
          {dirty ? (
            <SettingsAction
              label="Unsaved Notion locations"
              hint="Save updated Notion URLs and data source IDs for future handoffs."
              actionLabel="Save"
              onPress={saveDraft}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
