import { OrgDocument } from "../types";

export interface SearchResult {
  doc: OrgDocument;
  score: number;
  snippet: string;
  matchIdx: number;
}

export function searchDocs(docs: OrgDocument[], query: string): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return docs
    .map(doc => scoreDoc(doc, q))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

function scoreDoc(doc: OrgDocument, q: string): SearchResult {
  const titleLower = doc.title.toLowerCase();
  const contentLower = doc.content.toLowerCase();
  const titleMatch = titleLower.includes(q);
  const contentIdx = contentLower.indexOf(q);
  const score = (titleMatch ? 10 : 0) + (contentIdx >= 0 ? 1 : 0);
  let snippet = "";
  if (contentIdx >= 0) {
    const start = Math.max(0, contentIdx - 60);
    const end = Math.min(doc.content.length, contentIdx + q.length + 60);
    snippet = doc.content.slice(start, end).replace(/\n+/g, " ").trim();
  }
  return { doc, score, snippet, matchIdx: contentIdx };
}

export function highlightMatch(text: string, query: string): string {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    text.slice(0, idx) +
    "<mark>" +
    text.slice(idx, idx + query.length) +
    "</mark>" +
    text.slice(idx + query.length)
  );
}
