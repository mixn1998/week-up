"use client";

import { useEffect, useMemo, useState } from "react";
import type { AiServiceStatus } from "../lib/review-summary-client";
import type { AiProviderId, AiReviewState } from "../lib/week-up-domain";

type Props = Readonly<{
  config: AiReviewState;
  status?: AiServiceStatus;
  checking: boolean;
  onConfigure: (value: Readonly<{ preferredProvider: AiProviderId; apiBaseUrl: string; model?: string; reasoningEffort?: string }>) => void;
  onRefresh: () => void;
}>;

const effortLabels: Record<string, string> = { low: "轻量", medium: "标准", high: "深入", xhigh: "高强度", max: "最大", ultra: "极致" };

export function AiStatusControl({ config, status, checking, onConfigure, onRefresh }: Props) {
  const [open, setOpen] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState(config.apiBaseUrl);
  useEffect(() => setApiBaseUrl(config.apiBaseUrl), [config.apiBaseUrl]);
  const selectedModel = useMemo(() => status?.codex.models.find((model) => model.id === config.model) ?? status?.codex.models[0], [config.model, status?.codex.models]);
  const actualProvider = status?.lastExecution?.provider
    ?? (config.preferredProvider === "api" && status?.api.available ? "api" : status?.codex.authenticated ? "codex-cli" : undefined);
  const fallbackActive = config.preferredProvider === "api" && actualProvider === "codex-cli";
  const healthy = actualProvider !== undefined;
  const label = checking && !status
    ? "AI · 检测中"
    : fallbackActive
      ? "AI · Codex CLI 备用中"
      : actualProvider === "api"
        ? "AI · API 已连接"
        : actualProvider === "codex-cli"
          ? "AI · Codex CLI 已连接"
          : "AI · 需要检查";
  const configure = (patch: Partial<AiReviewState>) => onConfigure({
    preferredProvider: patch.preferredProvider ?? config.preferredProvider,
    apiBaseUrl: patch.apiBaseUrl ?? config.apiBaseUrl,
    model: patch.model ?? config.model,
    reasoningEffort: patch.reasoningEffort ?? config.reasoningEffort,
  });
  return <div className="ai-status-control">
    <button className={`ai-status-trigger${healthy ? " is-healthy" : " is-unavailable"}${fallbackActive ? " is-fallback" : ""}`} aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className="ai-status-sprite">✦</span><span><small>WEEK UP AI</small><b>{label}</b></span><i>{open ? "▲" : "▼"}</i>
    </button>
    {open && <section className="ai-runtime-popover pixel-card" aria-label="AI 回顾服务">
      <header><div><span className="eyebrow">AI COMPANION</span><h2>回顾小助手</h2><p>默认使用 Codex CLI；API 暂时离线时会自动回到 Codex。</p></div><button className="ai-close" onClick={() => setOpen(false)} aria-label="关闭">×</button></header>
      <div className="ai-provider-grid">
        <button className={config.preferredProvider === "codex-cli" ? "active" : ""} onClick={() => configure({ preferredProvider: "codex-cli" })}>
          <span className="provider-pixel provider-pixel--cli">⌘</span><div><b>Codex CLI</b><small>{status?.codex.authenticated ? `已登录 · ${status.codex.version ?? "可用"}` : status?.codex.available ? "需要登录或读取模型" : "未检测到可用服务"}</small></div><em>{status?.codex.authenticated ? "●" : "○"}</em>
        </button>
        <button className={config.preferredProvider === "api" ? "active" : ""} onClick={() => configure({ preferredProvider: "api", apiBaseUrl })}>
          <span className="provider-pixel provider-pixel--api">↗</span><div><b>自定义 API</b><small>{status?.api.available ? "连接正常" : config.apiBaseUrl ? "当前不可用 · 将自动回退" : "等待填写地址"}</small></div><em>{status?.api.available ? "●" : "○"}</em>
        </button>
      </div>
      <label className="ai-api-field"><span>API 服务地址</span><div><input value={apiBaseUrl} placeholder="例如：http://127.0.0.1:8000" onChange={(event) => setApiBaseUrl(event.target.value)} /><button onClick={() => configure({ preferredProvider: "api", apiBaseUrl: apiBaseUrl.trim().replace(/\/$/, "") })}>保存并选择</button></div></label>
      {selectedModel && <div className="ai-model-row">
        <label><span>Codex 模型</span><select value={selectedModel.id} onChange={(event) => { const model = status!.codex.models.find((item) => item.id === event.target.value)!; configure({ model: model.id, reasoningEffort: model.defaultReasoningEffort }); }}>{status?.codex.models.map((model) => <option key={model.id} value={model.id}>{model.displayName}</option>)}</select></label>
        <label><span>思考强度</span><select value={selectedModel.supportedReasoningEfforts.includes(config.reasoningEffort ?? "") ? config.reasoningEffort : selectedModel.defaultReasoningEffort} onChange={(event) => configure({ model: selectedModel.id, reasoningEffort: event.target.value })}>{selectedModel.supportedReasoningEfforts.map((effort) => <option key={effort} value={effort}>{effortLabels[effort] ?? effort}</option>)}</select></label>
      </div>}
      <footer><div><b>实际执行：{actualProvider === "api" ? "自定义 API" : actualProvider === "codex-cli" ? "Codex CLI" : "尚未可用"}</b><small>{status?.lastExecution ? `${status.lastExecution.fallbackUsed ? "已自动回退 · " : ""}${new Date(status.lastExecution.checkedAt).toLocaleString("zh-CN")}` : "生成周报或月报后，这里会同步实际来源"}</small></div><button onClick={onRefresh} disabled={checking}>{checking ? "检测中…" : "重新检测"}</button></footer>
    </section>}
  </div>;
}
