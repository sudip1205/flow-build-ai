"use client";

import { useEffect, useMemo, useState } from "react";
import { LANGUAGE_LABELS, TargetLanguage } from "@/lib/graph/types";
import { GeneratedFile } from "@/lib/prompts/codegen";
import { download } from "@/lib/download";
import { zip } from "@/lib/zip";

/** One press of "Generate code", from the diagram's JSON to the files the model wrote. */
export interface BuildRun {
  id: number;
  language: TargetLanguage;
  graphJson: string;
  nodeCount: number;
  edgeCount: number;
  spec: string;
  prompt: string;
  startedAt: number;
  status: "running" | "done" | "error";
  model?: string;
  durationMs?: number;
  raw?: string;
  /** The reply stopped at the model's output limit; the last file is incomplete. */
  truncated?: boolean;
  files: GeneratedFile[];
  error?: string;
}

type StepStatus = "pending" | "running" | "done" | "error";

interface Step {
  key: string;
  title: string;
  detail: string;
  status: StepStatus;
  /** The file this step produced, opened when the step is clicked. */
  path?: string;
}

// The pipeline's intermediate outputs, listed beside the generated code.
const PIPELINE_FILES = { json: "flow.json", context: "context.txt", prompt: "prompt.md", response: "response.md" };

const approxTokens = (text: string) => `≈${Math.ceil(text.length / 4).toLocaleString()} tokens`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

function buildSteps(run: BuildRun, elapsedMs: number): Step[] {
  const llm: StepStatus = run.status === "running" ? "running" : run.status === "error" ? "error" : "done";
  return [
    {
      key: "json",
      title: "Serialize flow to JSON",
      detail: `${run.nodeCount} nodes · ${run.edgeCount} edges`,
      status: "done",
      path: PIPELINE_FILES.json,
    },
    {
      key: "context",
      title: "Build context",
      detail: `Validated, walked from Start · ${run.spec.split("\n").length} lines`,
      status: "done",
      path: PIPELINE_FILES.context,
    },
    {
      key: "prompt",
      title: "Compose prompt",
      detail: `${LANGUAGE_LABELS[run.language]} · ${approxTokens(run.prompt)}`,
      status: "done",
      path: PIPELINE_FILES.prompt,
    },
    {
      key: "llm",
      title: "Send to LLM",
      detail:
        llm === "error"
          ? run.error ?? "Failed"
          : `${run.model ?? "Configured model"} · ${seconds(run.durationMs ?? elapsedMs)}${run.truncated ? " · cut off" : ""}`,
      status: llm,
      path: run.raw ? PIPELINE_FILES.response : undefined,
    },
    {
      key: "files",
      title: "Extract files",
      detail:
        run.status === "done"
          ? `${run.files.length} file${run.files.length === 1 ? "" : "s"}${run.truncated ? " · last one incomplete" : ""}`
          : "Waiting for the reply",
      status: run.status === "done" ? "done" : "pending",
      path: run.files[0]?.path,
    },
  ];
}

const STATUS_ICON: Record<StepStatus, string> = { pending: "", running: "", done: "✓", error: "!" };

interface Folder {
  name: string;
  folders: Folder[];
  files: GeneratedFile[];
}

/**
 * Nests the generated files by directory, merging chains of single-folder
 * directories into one row ("src/main/java/com/flowbuild/app") like an IDE does.
 */
function fileTree(files: GeneratedFile[]): Folder {
  const root: Folder = { name: "", folders: [], files: [] };
  for (const file of files) {
    let folder = root;
    for (const part of file.path.split("/").slice(0, -1)) {
      let child = folder.folders.find((f) => f.name === part);
      if (!child) folder.folders.push((child = { name: part, folders: [], files: [] }));
      folder = child;
    }
    folder.files.push(file);
  }
  const compact = (folder: Folder): Folder => {
    let merged = folder;
    while (merged.name && merged.files.length === 0 && merged.folders.length === 1) {
      const only = merged.folders[0];
      merged = { ...only, name: `${merged.name}/${only.name}` };
    }
    return { ...merged, folders: merged.folders.map(compact) };
  };
  return compact(root);
}

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export default function BuildStudio({
  run,
  onCancel,
  onRegenerate,
  onClose,
}: {
  run: BuildRun;
  onCancel: () => void;
  onRegenerate: () => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string>(PIPELINE_FILES.prompt);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Show the prompt while the model works on it, then the code once it lands.
  useEffect(() => {
    setSelected(run.status === "done" && run.files[0] ? run.files[0].path : PIPELINE_FILES.prompt);
  }, [run.id, run.status, run.files]);

  useEffect(() => {
    if (run.status !== "running") return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [run.status]);

  const steps = buildSteps(run, Math.max(0, now - run.startedAt));

  const pipelineFiles = useMemo(() => {
    const files: GeneratedFile[] = [
      { path: PIPELINE_FILES.json, content: run.graphJson },
      { path: PIPELINE_FILES.context, content: run.spec },
      { path: PIPELINE_FILES.prompt, content: run.prompt },
    ];
    if (run.raw) files.push({ path: PIPELINE_FILES.response, content: run.raw });
    return files;
  }, [run.graphJson, run.spec, run.prompt, run.raw]);

  const file = [...run.files, ...pipelineFiles].find((f) => f.path === selected) ?? pipelineFiles[2];
  const lines = file.content.split("\n");
  const tree = useMemo(() => fileTree(run.files), [run.files]);
  const partial = run.truncated ? run.files[run.files.length - 1]?.path : undefined;

  const downloadAll = () =>
    download(zip(run.files), `flowbuild-${run.language}-project.zip`, "application/zip");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the text is selectable in the viewer.
    }
  };

  const fileButton = (f: GeneratedFile, label = f.path) => (
    <li key={f.path}>
      <button
        className={`fb-explorer__file${f.path === file.path ? " is-active" : ""}`}
        onClick={() => setSelected(f.path)}
        aria-current={f.path === file.path ? "true" : undefined}
        title={f.path}
      >
        <span className="fb-explorer__ext" data-ext={f.path.split(".").pop()} aria-hidden />
        <span className="fb-explorer__name">{label}</span>
        {f.path === partial && <span className="fb-explorer__badge">incomplete</span>}
      </button>
    </li>
  );

  const folderItems = (folder: Folder) => [
    ...folder.folders.map((child) => (
      <li key={child.name}>
        <details className="fb-explorer__folder" open>
          <summary>{child.name}</summary>
          <ul>{folderItems(child)}</ul>
        </details>
      </li>
    )),
    ...folder.files.map((f) => fileButton(f, baseName(f.path))),
  ];

  return (
    <aside className="fb-studio" aria-label="Code generation">
      <header className="fb-studio__header">
        <div className="fb-studio__heading">
          <strong>Build · {LANGUAGE_LABELS[run.language]}</strong>
          <span className={`fb-pill fb-pill--${run.status}`}>
            {run.status === "running" ? "Generating" : run.status === "done" ? "Done" : "Failed"}
          </span>
        </div>
        <div className="fb-row">
          {run.status === "running" ? (
            <button className="fb-btn" onClick={onCancel}>Cancel</button>
          ) : (
            <button className="fb-btn" onClick={onRegenerate}>Regenerate</button>
          )}
          <button className="fb-btn" onClick={onClose} aria-label="Hide build panel" title="Back to the canvas">
            ✕
          </button>
        </div>
      </header>

      <div className="fb-studio__body">
        <nav className="fb-steps" aria-label="Generation steps">
          <h2 className="fb-section__title">Workflow</h2>
          <ol>
            {steps.map((step, i) => (
              <li key={step.key} className={`fb-step fb-step--${step.status}`}>
                <span className="fb-step__marker" aria-hidden>
                  {step.status === "running" ? <span className="fb-spinner" /> : STATUS_ICON[step.status] || i + 1}
                </span>
                <button
                  className={`fb-step__card${step.path && step.path === file.path ? " is-active" : ""}`}
                  disabled={!step.path}
                  onClick={() => step.path && setSelected(step.path)}
                >
                  <span className="fb-step__title">{step.title}</span>
                  <span className="fb-step__detail">{step.detail}</span>
                  <span className="fb-visually-hidden">({step.status})</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <section className="fb-explorer" aria-label="Files">
          <div className="fb-explorer__tree">
            <div className="fb-explorer__head">
              <h2 className="fb-section__title">Generated</h2>
              {run.files.length > 0 && (
                <button className="fb-btn fb-btn--small" onClick={downloadAll} title="Download every generated file as a .zip">
                  Download all
                </button>
              )}
            </div>
            {partial && (
              <p className="fb-explorer__warning" role="status">
                The reply hit the model&apos;s output limit, so {baseName(partial)} is cut off. Regenerate, or pick a
                model with a larger output limit.
              </p>
            )}
            {run.files.length ? (
              <ul className="fb-explorer__list">{folderItems(tree)}</ul>
            ) : (
              <p className="fb-muted fb-explorer__empty">
                {run.status === "running" ? "Waiting for the model…" : "No files."}
              </p>
            )}
            <h2 className="fb-section__title">Pipeline</h2>
            <ul className="fb-explorer__list">{pipelineFiles.map((f) => fileButton(f))}</ul>
          </div>

          <div className="fb-viewer">
            <div className="fb-viewer__bar">
              <span className="fb-viewer__path">{file.path}</span>
              <div className="fb-row">
                <button className="fb-btn" onClick={copy}>{copied ? "Copied!" : "Copy"}</button>
                <button className="fb-btn" onClick={() => download(file.content, file.path, "text/plain")}>
                  Download
                </button>
              </div>
            </div>
            <pre className={`fb-viewer__code${/\.(md|txt)$/.test(file.path) ? " fb-viewer__code--wrap" : ""}`} tabIndex={0}>
              <code>
                {lines.map((line, i) => (
                  <span key={i} className="fb-viewer__line">
                    {line || " "}
                  </span>
                ))}
              </code>
            </pre>
          </div>
        </section>
      </div>
    </aside>
  );
}
