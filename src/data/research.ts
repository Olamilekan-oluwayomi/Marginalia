export type ResearchWorkspace = {
  id: string;
  title: string;
  description: string;
  documents: number;
  updated: string;
};

export const workspaces: ResearchWorkspace[] = [
  {
    id: "rainfall-variability",
    title: "Rainfall variability and seasonal onset",
    description:
      "Investigating rainfall onset, peak and retreat dates across the study region.",
    documents: 3,
    updated: "today",
  },
  {
    id: "climate-change-literature",
    title: "Climate change literature review",
    description:
      "Collection of papers examining recent climate variability and trends.",
    documents: 7,
    updated: "yesterday",
  },
  {
    id: "urban-heat-island",
    title: "Urban heat island analysis",
    description:
      "Exploring temperature gradients between urban cores and surrounding areas.",
    documents: 4,
    updated: "3 days ago",
  },
];

export type ResearchDocument = {
  title: string;
  type: string;
  pages: number;
  added: string;
  status: string;
};

export const documents: ResearchDocument[] = [
  {
    title: "Rainfall Onset, Peak and Retreat Dates",
    type: "PDF",
    pages: 24,
    added: "10 Aug 2026",
    status: "Ready",
  },
  {
    title: "Climate Variability and Seasonal Rainfall",
    type: "PDF",
    pages: 18,
    added: "9 Aug 2026",
    status: "Ready",
  },
  {
    title: "Rainfall Patterns in West Africa",
    type: "PDF",
    pages: 32,
    added: "7 Aug 2026",
    status: "Ready",
  },
];
