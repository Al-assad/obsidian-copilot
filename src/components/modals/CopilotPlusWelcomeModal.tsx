import React from "react";
import { App, Modal } from "obsidian";
import { Root } from "react-dom/client";
import { Button } from "@/components/ui/button";
import { createPluginRoot } from "@/utils/react/createPluginRoot";
import {
  DEFAULT_COPILOT_PLUS_CHAT_MODEL,
  DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL,
  DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL_KEY,
  applyPlusSettings,
} from "@/plusUtils";
import { getSettings } from "@/settings/model";
import { TriangleAlert } from "lucide-react";

function CopilotPlusWelcomeModalContent({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const settings = getSettings();
  return (
    <div className="tw-flex tw-flex-col tw-gap-4">
      <div>
        <p>
          Advanced Copilot features are available. You can apply a recommended default configuration
          for chat and embeddings now, or keep your current setup.
        </p>
        <p>
          Would you like to apply the recommended settings now? You can always change them later in
          Settings.
        </p>
        <ul className="tw-pl-4">
          <li>
            Default mode: <b className="tw-text-accent">Copilot Plus</b>
          </li>
          <li>
            Chat model: <b className="tw-text-accent">{DEFAULT_COPILOT_PLUS_CHAT_MODEL}</b>
          </li>
          <li>
            <div>
              Embedding model:{" "}
              <b className="tw-text-accent">{DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL}</b>
            </div>
            {settings.embeddingModelKey !== DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL_KEY && (
              <div className="tw-flex tw-items-center tw-gap-1 tw-text-sm tw-text-warning">
                <TriangleAlert className="tw-size-4" /> It will rebuild your embeddings for the
                entire vault
              </div>
            )}
          </li>
        </ul>
      </div>
      <div className="tw-flex tw-w-full tw-justify-end tw-gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Apply Later
        </Button>
        <Button variant="default" onClick={onConfirm}>
          Apply Now
        </Button>
      </div>
    </div>
  );
}

export class CopilotPlusWelcomeModal extends Modal {
  private root: Root;

  constructor(app: App) {
    super(app);
    // https://docs.obsidian.md/Reference/TypeScript+API/Modal/setTitle
    // @ts-ignore
    this.setTitle("Apply Recommended Copilot Defaults");
  }

  onOpen() {
    const { contentEl } = this;
    this.root = createPluginRoot(contentEl, this.app);

    const handleConfirm = () => {
      applyPlusSettings();
      this.close();
    };

    const handleCancel = () => {
      this.close();
    };

    this.root.render(
      <CopilotPlusWelcomeModalContent onConfirm={handleConfirm} onCancel={handleCancel} />
    );
  }

  onClose() {
    this.root.unmount();
  }
}
