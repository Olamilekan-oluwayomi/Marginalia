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

export type RecentDocument = {
  title: string;
  type: string;
  added: string;
};

export const recentDocuments: RecentDocument[] = [
  {
    title: "Rainfall Onset, Peak and Retreat Dates",
    type: "PDF",
    added: "10 Aug 2026",
  },
  {
    title: "Climate Variability and Seasonal Rainfall",
    type: "PDF",
    added: "9 Aug 2026",
  },
  {
    title: "Rainfall Patterns in West Africa",
    type: "PDF",
    added: "7 Aug 2026",
  },
];
