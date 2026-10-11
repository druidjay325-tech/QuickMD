import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { tr, useLocale } from "../i18n";
import {
  checkVersionUpdate,
  openProjectLink,
  type VersionCheck,
} from "../commands";
import metadata from "../../package.json";
import information from "../projectInfo.json";
import { useModalFocus } from "./useModalFocus";
import "./AboutProject.css";

interface ProjectLink {
  label: string;
  url: string;
}
interface ContactInformation {
  label: string;
  value?: string;
  url?: string;
}
interface SupportCode {
  label: string;
  image: string;
}
export interface ProjectInformation {
  repository: string;
  license: string;
  author: { name: string; contacts: ContactInformation[] };
  support: {
    message: { "zh-CN": string; en: string };
    links: ProjectLink[];
    qrCodes: SupportCode[];
  };
}
export default function AboutProject({
  onClose,
  info = information,
}: {
  onClose: () => void;
  info?: ProjectInformation;
}) {
  const locale = useLocale();
  const card = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"about" | "support">("about");
  const supportAvailable = locale === "zh-CN";
  const activeView = supportAvailable ? view : "about";
  useEffect(() => {
    if (!supportAvailable) setView("about");
  }, [supportAvailable]);
  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);
  const [result, setResult] = useState<VersionCheck | null>(null);
  const [error, setError] = useState<{
    kind: "link" | "update";
    detail: string;
  } | null>(null);
  const returnOrClose = () => {
    if (activeView === "support") setView("about");
    else onClose();
  };
  const closeRef = useRef(returnOrClose);
  closeRef.current = returnOrClose;
  useModalFocus(card, () => closeRef.current());
  useEffect(() => {
    card.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [activeView]);
  const openLink = async (url: string) => {
    setError(null);
    try {
      await openProjectLink(url);
    } catch (error) {
      setError({ kind: "link", detail: String(error) });
    }
  };
  const check = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      setResult(await checkVersionUpdate());
    } catch (error) {
      setError({ kind: "update", detail: String(error) });
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  };
  const supportMessage =
    info.support.message[locale] || tr("about.supportMessage");
  return createPortal(
    <div className="project-overlay" onClick={returnOrClose}>
      <div
        ref={card}
        className="project-panel"
        role="dialog"
        aria-modal="true"
        aria-label={tr(
          activeView === "about" ? "about.title" : "about.support",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="project-header">
          <h2>
            {tr(activeView === "about" ? "about.title" : "about.support")}
          </h2>
          <button
            type="button"
            className="settings-close"
            aria-label={tr("ui.close")}
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <div className="project-content">
          {activeView === "about" ? (
            <>
              <div className="project-identity">
                <img
                  src={
                    new URL(
                      "../../src-tauri/icons/128x128.png",
                      import.meta.url,
                    ).href
                  }
                  width="52"
                  height="52"
                  alt=""
                />
                <div>
                  <h3>QuickMD</h3>
                  <p>{tr("about.tagline")}</p>
                </div>
              </div>
              <dl className="project-facts">
                <div>
                  <dt>{tr("about.version")}</dt>
                  <dd>{metadata.version}</dd>
                </div>
                <div>
                  <dt>{tr("about.author")}</dt>
                  <dd>{info.author.name}</dd>
                </div>
                <div>
                  <dt>{tr("about.license")}</dt>
                  <dd>{info.license}</dd>
                </div>
              </dl>
              <p className="project-summary">{tr("about.description")}</p>
              <button
                type="button"
                className="project-text-link"
                onClick={() => void openLink(info.repository)}
              >
                {tr("about.repository")}
              </button>
              <section className="project-section">
                <h3>{tr("about.contact")}</h3>
                {info.author.contacts.length ? (
                  <dl className="project-contacts">
                    {info.author.contacts.map((contact) => (
                      <div key={contact.label}>
                        <dt>{contact.label}</dt>
                        <dd>
                          {contact.value ??
                            contact.url?.replace(/^mailto:/i, "") ??
                            ""}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="project-placeholder">{tr("about.pending")}</p>
                )}
              </section>
              <div className="project-actions">
                <button
                  type="button"
                  className="settings-btn"
                  disabled={checking}
                  onClick={() => void check()}
                >
                  {tr(checking ? "about.checking" : "about.checkUpdates")}
                </button>
                {supportAvailable && (
                  <button
                    type="button"
                    className="settings-btn"
                    onClick={() => {
                      setError(null);
                      setView("support");
                    }}
                  >
                    {tr("about.support")}
                  </button>
                )}
              </div>
              <p className="project-hint">{tr("about.updatePrivacy")}</p>
              {result && (
                <div role="status" className="project-update">
                  <p>
                    {tr("about.status." + result.status, {
                      version: result.latestVersion || "",
                    })}
                  </p>
                  {result.releaseUrl && (
                    <button
                      type="button"
                      className="project-text-link"
                      onClick={() => void openLink(result.releaseUrl!)}
                    >
                      {tr("about.viewRelease")}
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="project-summary">{supportMessage}</p>
              {info.support.links.length || info.support.qrCodes.length ? (
                <>
                  <div className="project-links">
                    {info.support.links.map((link) => (
                      <button
                        type="button"
                        key={link.label + link.url}
                        className="settings-btn"
                        onClick={() => void openLink(link.url)}
                      >
                        {link.label}
                      </button>
                    ))}
                  </div>
                  <div className="project-qr-codes">
                    {info.support.qrCodes.map((code) => (
                      <figure key={code.image}>
                        <img src={code.image} alt={code.label} loading="lazy" />
                        <figcaption>{code.label}</figcaption>
                      </figure>
                    ))}
                  </div>
                </>
              ) : (
                <p className="project-placeholder">{tr("about.pending")}</p>
              )}
              <button
                type="button"
                className="project-text-link"
                onClick={() => setView("about")}
              >
                {tr("about.back")}
              </button>
            </>
          )}
          {error && (
            <div role="alert" className="project-error">
              <p>
                {tr(
                  error.kind === "update"
                    ? "about.updateFailed"
                    : "about.linkFailed",
                )}
              </p>
              <details>
                <summary>{tr("about.details")}</summary>
                <p>{error.detail}</p>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
