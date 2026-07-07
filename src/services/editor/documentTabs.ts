import type { WorkbenchDocument } from "../../types/domain";

export interface DocumentTab extends WorkbenchDocument {
  id: string;
}

export type DocumentUpdater = WorkbenchDocument | ((current: WorkbenchDocument) => WorkbenchDocument);

export function createDocumentTab(document: WorkbenchDocument, id: string): DocumentTab {
  return {
    ...document,
    id,
  };
}

export function getActiveDocumentTab(tabs: DocumentTab[], activeId: string): DocumentTab | undefined {
  return tabs.find((tab) => tab.id === activeId) ?? tabs[0];
}

export function updateDocumentTab(tabs: DocumentTab[], tabId: string, updater: DocumentUpdater): DocumentTab[] {
  return tabs.map((tab) => {
    if (tab.id !== tabId) return tab;
    const nextDocument = typeof updater === "function" ? updater(toWorkbenchDocument(tab)) : updater;
    return {
      ...nextDocument,
      id: tab.id,
    };
  });
}

export function appendDocumentTabs(tabs: DocumentTab[], documents: DocumentTab[]): DocumentTab[] {
  if (documents.length === 0) return tabs;
  const existingIds = new Set(tabs.map((tab) => tab.id));
  const next = documents.filter((document) => !existingIds.has(document.id));
  return [...tabs, ...next];
}

export function closeDocumentTab(
  tabs: DocumentTab[],
  activeId: string,
  closingId: string,
): { tabs: DocumentTab[]; activeId: string } {
  if (tabs.length <= 1) {
    return { tabs, activeId };
  }

  const closingIndex = tabs.findIndex((tab) => tab.id === closingId);
  if (closingIndex < 0) {
    return { tabs, activeId };
  }

  const nextTabs = tabs.filter((tab) => tab.id !== closingId);
  if (activeId !== closingId) {
    return {
      tabs: nextTabs,
      activeId: nextTabs.some((tab) => tab.id === activeId) ? activeId : nextTabs[0].id,
    };
  }

  const nextActiveIndex = Math.min(closingIndex, nextTabs.length - 1);
  return {
    tabs: nextTabs,
    activeId: nextTabs[nextActiveIndex].id,
  };
}

function toWorkbenchDocument(tab: DocumentTab): WorkbenchDocument {
  const { id: _id, ...document } = tab;
  return document;
}
