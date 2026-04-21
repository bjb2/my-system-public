export interface OrgDocument {
  path: string;
  filename: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  type: string;
  status?: string;
  tags: string[];
  created?: string;
  updated?: string;
  links: string[]; // wikilinks extracted from content
}

export interface OrgIndex {
  documents: OrgDocument[];
  lastUpdated: number;
}
