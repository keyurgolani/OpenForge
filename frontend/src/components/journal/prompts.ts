export interface JournalPrompt {
  label: string
  body: string
}

export const CURATED_PROMPTS: JournalPrompt[] = [
  {
    label: 'Daily reflection',
    body: '## Daily reflection\n\nWhat went well:\n- \n\nWhat didn\'t:\n- \n\nTomorrow\'s focus:\n- ',
  },
  {
    label: 'Decision log',
    body: '## Decision\n\n**Context:** \n**Choice:** \n**Why:** \n**Tradeoffs:** ',
  },
  {
    label: 'Standup',
    body: '## Standup\n\n- Yesterday: \n- Today: \n- Blockers: ',
  },
  {
    label: 'Bug discovered',
    body: '## Bug discovered\n\n**Symptom:** \n**Suspected cause:** \n**Repro:** ',
  },
  {
    label: 'Free-form note',
    body: '',
  },
]
