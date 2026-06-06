import { SearchBar } from "@/components/ui/SearchBar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CHAT_HISTORY_VIEWTYPE } from "@/constants";
import { cn } from "@/lib/utils";
import CopilotPlugin from "@/main";
import { extractChatTitle } from "@/utils/chatHistoryUtils";
import { createPluginRoot } from "@/utils/react/createPluginRoot";
import { MessageCircle } from "lucide-react";
import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import React, { useEffect, useMemo, useState } from "react";
import { Root } from "react-dom/client";

interface ChatHistoryPanelProps {
  plugin: CopilotPlugin;
}

interface ChatHistorySidebarItem {
  id: string;
  title: string;
  modifiedAt: Date;
}

/**
 * Left sidebar view for searching and loading saved Copilot chat history.
 */
export default class ChatHistoryView extends ItemView {
  private root: Root | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: CopilotPlugin
  ) {
    super(leaf);
  }

  getViewType(): string {
    return CHAT_HISTORY_VIEWTYPE;
  }

  getIcon(): string {
    return "history";
  }

  getTitle(): string {
    return "Chat History";
  }

  getDisplayText(): string {
    return "Chat History";
  }

  async onOpen(): Promise<void> {
    this.root = createPluginRoot(this.containerEl.children[1], this.app);
    this.renderView();
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }

  /**
   * Refresh the list after external chat-history changes.
   */
  refresh(): void {
    this.renderView();
  }

  private renderView(): void {
    if (!this.root) return;
    this.root.render(<ChatHistoryPanel plugin={this.plugin} />);
  }
}

function ChatHistoryPanel({ plugin }: ChatHistoryPanelProps) {
  const [items, setItems] = useState<ChatHistorySidebarItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(
    () => plugin.getCurrentChatHistory()?.id ?? null
  );

  useEffect(() => {
    let cancelled = false;

    const loadItems = async () => {
      setLoading(true);
      const chatFiles = await plugin.getChatHistoryFiles();
      const chatItems = chatFiles.map((file) => ({
        id: file.path,
        title: extractChatTitle(file),
        modifiedAt: new Date(file.stat.mtime),
      }));
      if (!cancelled) {
        setItems(chatItems);
        setLoading(false);
      }
    };

    void loadItems();
    const eventRefs = [
      plugin.app.vault.on("create", (file) => {
        if (file instanceof TFile) void loadItems();
      }),
      plugin.app.vault.on("modify", (file) => {
        if (file instanceof TFile) void loadItems();
      }),
      plugin.app.vault.on("delete", (file) => {
        if (file instanceof TFile) void loadItems();
      }),
    ];

    return () => {
      cancelled = true;
      eventRefs.forEach((ref) => plugin.app.vault.offref(ref));
    };
  }, [plugin]);

  useEffect(() => {
    return plugin.subscribeCurrentChatHistory(() => {
      setActiveChatId(plugin.getCurrentChatHistory()?.id ?? null);
    });
  }, [plugin]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;

    return items.filter((item) => item.title.toLowerCase().includes(normalizedQuery));
  }, [items, query]);

  const sortedItems = useMemo(
    () => filteredItems.toSorted((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime()),
    [filteredItems]
  );

  const groupedItems = useMemo(() => groupByRelativeDay(sortedItems), [sortedItems]);

  const handleLoadChat = async (id: string) => {
    await plugin.loadChatByIdInMainWorkspace(id);
    const chatFiles = await plugin.getChatHistoryFiles();
    setItems(
      chatFiles.map((file) => ({
        id: file.path,
        title: extractChatTitle(file),
        modifiedAt: new Date(file.stat.mtime),
      }))
    );
  };

  return (
    <div className="tw-flex tw-h-full tw-flex-col tw-text-normal">
      <div className="tw-border-b tw-border-border tw-p-2">
        <SearchBar value={query} onChange={setQuery} placeholder="Search chat history..." />
      </div>

      <ScrollArea className="tw-min-h-0 tw-flex-1">
        <div className="tw-p-2">
          {loading ? (
            <div className="tw-py-8 tw-text-center tw-text-sm tw-text-muted">Loading...</div>
          ) : groupedItems.length === 0 ? (
            <div className="tw-py-8 tw-text-center tw-text-sm tw-text-muted">
              {query ? "No matching chat history found." : "No chat history"}
            </div>
          ) : (
            groupedItems.map((group) => (
              <div key={group.label} className="tw-mb-4">
                <div className="tw-mb-2 tw-px-2 tw-text-xs tw-font-medium tw-text-muted">
                  {group.label}
                </div>
                <div className="tw-space-y-1">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "tw-flex tw-w-full tw-items-center tw-gap-2 tw-rounded-md tw-p-2 tw-text-left tw-transition-colors hover:tw-bg-modifier-hover",
                        activeChatId === item.id &&
                          "tw-bg-modifier-hover tw-font-semibold tw-text-accent"
                      )}
                      onClick={() => void handleLoadChat(item.id)}
                    >
                      <MessageCircle className="tw-size-3 tw-shrink-0 tw-text-muted" />
                      <span className="tw-min-w-0 tw-flex-1 tw-truncate tw-text-sm tw-font-medium">
                        {item.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function groupByRelativeDay(items: ChatHistorySidebarItem[]): Array<{
  label: string;
  items: ChatHistorySidebarItem[];
}> {
  const groups = new Map<string, ChatHistorySidebarItem[]>();
  const now = new Date();

  items.forEach((item) => {
    const diffMs = now.getTime() - item.modifiedAt.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const label = diffDays === 0 ? "Today" : diffDays === 1 ? "Yesterday" : `${diffDays}d ago`;

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  });

  return Array.from(groups.entries()).map(([label, groupItems]) => ({
    label,
    items: groupItems,
  }));
}
