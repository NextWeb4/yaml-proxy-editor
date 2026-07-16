import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  Boxes,
  Braces,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FolderOpen,
  Globe2,
  Hash,
  ListChecks,
  Mail,
  Network,
  Plus,
  Radar,
  RefreshCcw,
  Save,
  SearchCheck,
  Settings,
  ShieldAlert,
  Trash2,
  Upload,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import "./styles.css";
import { CREATOR_INFO } from "./app/creatorInfo";
import { sampleConfig } from "./sampleConfig";
import { analyzeYaml, formatYaml, validateYamlBeforeSave } from "./services/yaml/yamlService";
import { createYamlTemplateDocument, listYamlTemplates, type YamlTemplateId } from "./services/yaml/yamlTemplates";
import { mergeProxyNodes } from "./services/merge/mergeConfig";
import {
  fetchSubscriptionWithNativeClient,
  isTauriRuntime,
  openYamlFilesWithDialog,
  saveYamlDocument,
} from "./services/desktop/desktopBridge";
import { filterYamlDropPaths, readBrowserYamlFiles, readDroppedYamlPaths } from "./services/desktop/fileDrop";
import {
  appendDocumentTabs,
  closeDocumentTab,
  createDocumentTab,
  getActiveDocumentTab,
  updateDocumentTab,
  type DocumentTab,
  type DocumentUpdater,
} from "./services/editor/documentTabs";
import { parseBatchSubscriptionInput } from "./services/subscription/batchSubscription";
import {
  buildNodeSubscriptionExport,
  type NodeSubscriptionExportFormat,
} from "./services/subscription/subscriptionExport";
import { parseSubscriptionText } from "./services/subscription/subscriptionParser";
import {
  createProviderDraftSelection,
  DEFAULT_PROVIDER_DRAFT_NAME,
  syncProviderSelectionFromYaml,
} from "./services/subscription/providerSelection";
import {
  refreshSubscriptionUrl,
  sanitizeSubscriptionError,
} from "./services/subscription/subscriptionRefresh";
import { buildOpenClashExport, type OpenClashExportResult } from "./services/openclash/openclashExport";
import { checkOpenClashCompatibility, diagnoseOpenClashLog } from "./services/openclash/openclashCompatibility";
import {
  checkRemoteProviders,
  type ProviderRemoteCheckSummary,
} from "./services/provider_check/providerCheck";
import {
  applyLeakProtectionToYaml,
  buildProxyProviderPreviewYaml,
  deleteProxyProviderFromYaml,
  redactConfigUrl,
  upsertProxyProviderInYaml,
  upsertProxyProvidersInYaml,
} from "./services/config/configOptimizer";
import {
  addProxyNodesToGroupInYaml,
  attachNodeGroups,
  disableProxyNodesInYaml,
  exportProxyNodesYaml,
  filterProxyNodes,
  getNodeFilterOptions,
  importSubscriptionNodesToYaml,
  normalizeProxyNodes,
  renameProxyNodeInYaml,
  type NodeEditResult,
  type NodeFilter,
} from "./services/nodes/nodeManager";
import {
  addRuleToYaml,
  applyRuleTemplateToYaml,
  buildWebsiteRulePreview,
  commentRulesInYaml,
  deleteRuleFromYaml,
  importRulesToYaml,
  moveRuleInYaml,
  RULE_TEMPLATES,
  SUPPORTED_RULE_TYPES,
  upsertWebsiteRuleInYaml,
  type RuleDraft,
  type RuleEditResult,
  type WebsiteRuleDraft,
} from "./services/rules/ruleEditor";
import type {
  Finding,
  ProxyGroup,
  ProxyNode,
  ProxyProvider,
  RuleItem,
  SubscriptionParseResult,
  WorkbenchDocument,
  YamlFormatSummary,
} from "./types/domain";

const NAV_ITEMS = [
  ["editor", FileCode2],
  ["subscriptions", Globe2],
  ["nodes", Network],
  ["rules", ListChecks],
  ["dns", ShieldAlert],
  ["openclash", SearchCheck],
] as const;

const YAML_TEMPLATES = listYamlTemplates();

type PageId = (typeof NAV_ITEMS)[number][0];
type UiLanguage = "zh" | "en";
type SubscriptionRemoteState = "idle" | "testing" | "refreshing" | "success" | "error";

const INITIAL_DOCUMENT_TAB_ID = "tab-initial";
const LANGUAGE_STORAGE_KEY = "yaml-proxy-editor.language";

const UI_COPY: Record<
  UiLanguage,
  {
    builtinSample: string;
    closeTab: string;
    creatorAria: string;
    creatorTitle: string;
    currentYaml: string;
    dropOpen: string;
    duplicateKey: string;
    emailTitle: (email: string) => string;
    formatAction: string;
    formatTitle: string;
    languageButton: string;
    languageLabel: string;
    languageSwitchTitle: string;
    mainNav: string;
    nav: Record<PageId, string>;
    newAction: string;
    newTitle: string;
    openAction: string;
    openSection: (label: string) => string;
    openTitle: string;
    rootType: string;
    saveAction: string;
    saveAsAction: string;
    saveAsTitle: string;
    saveTitle: string;
    templateTitle: string;
    topLevelFields: string;
    websiteTitle: string;
  }
> = {
  zh: {
    builtinSample: "内置样例",
    closeTab: "关闭标签",
    creatorAria: "创作者信息",
    creatorTitle: "创作者",
    currentYaml: "当前 YAML",
    dropOpen: "释放以打开 YAML",
    duplicateKey: "重复 key",
    emailTitle: (email) => `发送邮件给 ${email}`,
    formatAction: "格式化",
    formatTitle: "格式化 YAML",
    languageButton: "EN",
    languageLabel: "语言",
    languageSwitchTitle: "Switch to English",
    mainNav: "主导航",
    nav: {
      editor: "YAML 编辑器",
      subscriptions: "订阅管理",
      nodes: "节点管理",
      rules: "分流规则",
      dns: "DNS 审计",
      openclash: "OpenClash",
    },
    newAction: "新建",
    newTitle: "新建 YAML 配置",
    openAction: "打开",
    openSection: (label) => `打开${label}`,
    openTitle: "打开 YAML",
    rootType: "根类型",
    saveAction: "保存",
    saveAsAction: "另存",
    saveAsTitle: "另存为 YAML",
    saveTitle: "保存 YAML",
    templateTitle: "选择新建配置模板",
    topLevelFields: "顶层字段",
    websiteTitle: "打开个人网页",
  },
  en: {
    builtinSample: "Built-in sample",
    closeTab: "Close tab",
    creatorAria: "Creator information",
    creatorTitle: "Creator",
    currentYaml: "Current YAML",
    dropOpen: "Release to open YAML",
    duplicateKey: "Duplicate keys",
    emailTitle: (email) => `Send email to ${email}`,
    formatAction: "Format",
    formatTitle: "Format YAML",
    languageButton: "中文",
    languageLabel: "Language",
    languageSwitchTitle: "切换到中文",
    mainNav: "Main navigation",
    nav: {
      editor: "YAML Editor",
      subscriptions: "Subscriptions",
      nodes: "Nodes",
      rules: "Rules",
      dns: "DNS Audit",
      openclash: "OpenClash",
    },
    newAction: "New",
    newTitle: "Create YAML configuration",
    openAction: "Open",
    openSection: (label) => `Open ${label}`,
    openTitle: "Open YAML",
    rootType: "Root type",
    saveAction: "Save",
    saveAsAction: "Save As",
    saveAsTitle: "Save YAML as",
    saveTitle: "Save YAML",
    templateTitle: "Choose a new configuration template",
    topLevelFields: "Top-level fields",
    websiteTitle: "Open personal website",
  },
};

function getInitialLanguage(): UiLanguage {
  try {
    const saved = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    return saved === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}

function actionFinding(id: string, severity: Finding["severity"], title: string, message: string, path: string): Finding {
  return {
    id,
    severity,
    title,
    message,
    path,
  };
}

const YamlEditor = lazy(() =>
  import("./components/editor/YamlEditor").then((module) => ({
    default: module.YamlEditor,
  })),
);

export default function App() {
  const [activePage, setActivePage] = useState<PageId>("editor");
  const [language, setLanguageState] = useState<UiLanguage>(getInitialLanguage);
  const [documentTabs, setDocumentTabs] = useState<DocumentTab[]>(() => [
    createDocumentTab(
      {
        name: "example-openclash.yaml",
        content: sampleConfig,
        dirty: false,
      },
      INITIAL_DOCUMENT_TAB_ID,
    ),
  ]);
  const [activeDocumentId, setActiveDocumentId] = useState(INITIAL_DOCUMENT_TAB_ID);
  const [subscriptionText, setSubscriptionText] = useState("");
  const [subscriptionUrl, setSubscriptionUrl] = useState("");
  const [subscriptionName, setSubscriptionName] = useState(DEFAULT_PROVIDER_DRAFT_NAME);
  const [selectedProviderName, setSelectedProviderName] = useState<string>();
  const [subscriptionActionFindings, setSubscriptionActionFindings] = useState<Finding[]>([]);
  const [subscriptionTraffic, setSubscriptionTraffic] = useState<SubscriptionParseResult["traffic"]>();
  const [subscriptionRefreshState, setSubscriptionRefreshState] = useState<SubscriptionRemoteState>("idle");
  const [openClashLogText, setOpenClashLogText] = useState("");
  const [providerCheckState, setProviderCheckState] = useState<"idle" | "checking" | "done" | "error">("idle");
  const [providerCheckSummary, setProviderCheckSummary] = useState<ProviderRemoteCheckSummary>();
  const [selectedTemplateId, setSelectedTemplateId] = useState<YamlTemplateId>("openclash");
  const [lastSubscriptionRefresh, setLastSubscriptionRefresh] = useState<{
    redactedUrl: string;
    status: number;
    bytes: number;
    updatedAt: string;
    contentType?: string;
    requestProfileLabel?: string;
  }>();
  const [logs, setLogs] = useState<string[]>(["工作台已启动"]);
  const [isDropActive, setIsDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const documentTabCounterRef = useRef(1);
  const dragDepthRef = useRef(0);
  const selectedProviderNameRef = useRef<string | undefined>(undefined);
  const copy = UI_COPY[language];

  const documentState = useMemo(
    () => getActiveDocumentTab(documentTabs, activeDocumentId) ?? documentTabs[0]!,
    [activeDocumentId, documentTabs],
  );
  const analysis = useMemo(() => analyzeYaml(documentState.content), [documentState.content]);
  const manualSubscription = useMemo(() => {
    if (!subscriptionText.trim()) return undefined;
    const parsed = parseSubscriptionText(subscriptionText, subscriptionName.trim() || DEFAULT_PROVIDER_DRAFT_NAME);
    return subscriptionTraffic ? { ...parsed, traffic: subscriptionTraffic } : parsed;
  }, [subscriptionName, subscriptionText, subscriptionTraffic]);
  const subscription = manualSubscription;
  const mergedNodes = useMemo(
    () => mergeProxyNodes(analysis.clash.proxies, subscription?.nodes ?? []),
    [analysis.clash.proxies, subscription?.nodes],
  );
  const nodesWithGroups = useMemo(
    () => attachNodeGroups(mergedNodes.proxies, analysis.clash.proxyGroups),
    [analysis.clash.proxyGroups, mergedNodes.proxies],
  );
  const openClashExport = useMemo(
    () => buildOpenClashExport(documentState.content, subscription?.nodes ?? []),
    [documentState.content, subscription?.nodes],
  );
  const selectedProxyProvider = useMemo(
    () => analysis.clash.proxyProviders.find((item) => item.name === selectedProviderName),
    [analysis.clash.proxyProviders, selectedProviderName],
  );
  const subscriptionProviderPreview = useMemo(
    () =>
      buildProxyProviderPreviewYaml({
        name: subscriptionName,
        url: subscriptionUrl,
        existingProvider: selectedProxyProvider?.raw,
      }),
    [selectedProxyProvider?.raw, subscriptionName, subscriptionUrl],
  );
  const openClashCompatibility = useMemo(() => checkOpenClashCompatibility(analysis.value), [analysis.value]);
  const openClashLogFindings = useMemo(() => diagnoseOpenClashLog(openClashLogText), [openClashLogText]);
  const allFindings = [...analysis.syntaxFindings, ...analysis.clash.findings, ...(subscription?.findings ?? [])];
  const subscriptionPageFindings = useMemo(
    () => [...subscriptionActionFindings, ...(subscription?.findings ?? [])],
    [subscription?.findings, subscriptionActionFindings],
  );

  useEffect(() => {
    setProviderCheckState("idle");
    setProviderCheckSummary(undefined);
  }, [documentState.content]);

  useEffect(() => {
    selectedProviderNameRef.current = selectedProviderName;
  }, [selectedProviderName]);

  useEffect(() => {
    setSubscriptionActionFindings([]);
  }, [activeDocumentId]);

  useEffect(() => {
    const nextSelection = syncProviderSelectionFromYaml(analysis.clash.proxyProviders, selectedProviderNameRef.current);
    setSelectedProviderName(nextSelection.selectedProviderName);
    setSubscriptionName(nextSelection.subscriptionName);
    setSubscriptionUrl(nextSelection.subscriptionUrl);
  }, [activeDocumentId, analysis.clash.proxyProviders]);

  function setDocumentState(updater: DocumentUpdater, tabId = activeDocumentId) {
    setDocumentTabs((current) => updateDocumentTab(current, tabId, updater));
  }

  const openDocumentsInTabs = useCallback((documents: WorkbenchDocument[]) => {
    if (documents.length === 0) return;
    const tabs = documents.map((document) => {
      documentTabCounterRef.current += 1;
      return createDocumentTab(document, `tab-${documentTabCounterRef.current}`);
    });
    setDocumentTabs((current) => appendDocumentTabs(current, tabs));
    setActiveDocumentId(tabs[tabs.length - 1].id);
    setActivePage("editor");
  }, []);

  function closeDocumentById(tabId: string) {
    const result = closeDocumentTab(documentTabs, activeDocumentId, tabId);
    setDocumentTabs(result.tabs);
    setActiveDocumentId(result.activeId);
    if (result.tabs.length !== documentTabs.length) {
      appendLog(`已关闭 ${documentTabs.find((tab) => tab.id === tabId)?.name ?? "标签"}`);
    }
  }

  function updateContent(content: string) {
    setDocumentState((current) => ({ ...current, content, dirty: true }));
  }

  function selectSubscriptionProvider(name: string) {
    const provider = analysis.clash.proxyProviders.find((item) => item.name === name);
    setSelectedProviderName(provider?.name);
    setSubscriptionName(provider?.name ?? "");
    setSubscriptionUrl(provider?.url ?? "");
    setSubscriptionActionFindings([]);
    setLastSubscriptionRefresh(undefined);
    setSubscriptionRefreshState("idle");
  }

  function createSubscriptionProviderDraft() {
    const nextSelection = createProviderDraftSelection();
    setSelectedProviderName(nextSelection.selectedProviderName);
    setSubscriptionName(nextSelection.subscriptionName);
    setSubscriptionUrl(nextSelection.subscriptionUrl);
    setSubscriptionActionFindings([
      actionFinding("provider-draft-created", "info", "已新建订阅草稿", "填写名称和 URL 后会写入当前 YAML 的 proxy-providers。", "/proxy-providers"),
    ]);
    setLastSubscriptionRefresh(undefined);
    setSubscriptionRefreshState("idle");
  }

  function updateSubscriptionName(value: string) {
    setSubscriptionName(value);
    setSubscriptionActionFindings([]);
  }

  function updateSubscriptionUrl(value: string) {
    setSubscriptionUrl(value);
    setSubscriptionActionFindings([]);
  }

  function createNewDocument() {
    const document = createYamlTemplateDocument(selectedTemplateId);
    openDocumentsInTabs([document]);
    appendLog(`已新建 ${document.name}`);
  }

  async function openDocument() {
    try {
      const opened = await openYamlFilesWithDialog();
      if (opened?.length) {
        openDocumentsInTabs(opened.map((file) => ({ ...file, dirty: false })));
        appendLog(opened.length === 1 ? `已打开 ${opened[0].name}` : `已打开 ${opened.length} 个 YAML`);
        return;
      }
      fileInputRef.current?.click();
    } catch (error) {
      appendLog(`打开失败：${String(error)}`);
    }
  }

  async function saveDocument(saveAs = false) {
    try {
      const savingTabId = activeDocumentId;
      const savingDocument = documentState;
      const validation = validateYamlBeforeSave(documentState.content);
      const blockingFinding = validation.findings.find((finding) => finding.severity === "error");
      if (!validation.canSave || blockingFinding) {
        appendLog(`保存已阻止：${blockingFinding?.message ?? "YAML 语法错误"}`);
        return;
      }

      const result = await saveYamlDocument(savingDocument, saveAs);
      setDocumentState((current) => ({
        ...current,
        path: result?.path ?? current.path,
        dirty: false,
      }), savingTabId);
      appendLog(result?.backupPath ? `已保存，备份：${result.backupPath}` : "已保存");
    } catch (error) {
      appendLog(`保存失败：${String(error)}`);
    }
  }

  function formatDocument() {
    try {
      updateContent(formatYaml(documentState.content));
      appendLog("YAML 已格式化");
    } catch (error) {
      appendLog(`格式化失败：${String(error)}`);
    }
  }

  async function handleBrowserFiles(fileList?: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    try {
      const opened = await readBrowserYamlFiles(fileList);
      if (opened.length === 0) {
        appendLog("拖入文件已忽略：仅支持 .yaml / .yml");
        return;
      }
      openDocumentsInTabs(opened.map((file) => ({ ...file, dirty: false })));
      appendLog(opened.length === 1 ? `已打开 ${opened[0].name}` : `已打开 ${opened.length} 个 YAML`);
    } catch (error) {
      appendLog(`浏览器打开 YAML 失败：${String(error)}`);
    }
  }

  async function handleDroppedPaths(paths: string[]) {
    const yamlPaths = filterYamlDropPaths(paths);
    if (yamlPaths.length === 0) {
      appendLog("拖入文件已忽略：仅支持 .yaml / .yml");
      return;
    }

    try {
      const opened = await readDroppedYamlPaths(yamlPaths);
      openDocumentsInTabs(opened);
      appendLog(opened.length === 1 ? `已拖入 ${opened[0].name}` : `已拖入 ${opened.length} 个 YAML`);
    } catch (error) {
      appendLog(`拖入 YAML 失败：${String(error)}`);
    }
  }

  function hasDraggedFiles(event: DragEvent<HTMLElement>): boolean {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDropActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDropActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDropActive(false);
  }

  async function handleBrowserDrop(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDropActive(false);
    await handleBrowserFiles(event.dataTransfer.files);
  }

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().onDragDropEvent((event) => {
          if (event.payload.type === "enter" || event.payload.type === "over") {
            setIsDropActive(true);
            return;
          }

          if (event.payload.type === "leave") {
            setIsDropActive(false);
            return;
          }

          if (event.payload.type === "drop") {
            setIsDropActive(false);
            void handleDroppedPaths(event.payload.paths);
          }
        }),
      )
      .then((listener) => {
        if (disposed) {
          listener();
          return;
        }
        unlisten = listener;
      })
      .catch((error) => appendLog(`初始化拖入监听失败：${String(error)}`));

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  async function loadSubscriptionFromUrl(action: "test" | "refresh") {
    const actionLabel = action === "test" ? "订阅测试" : "订阅刷新";
    if (!subscriptionUrl.trim()) {
      setSubscriptionActionFindings([
        actionFinding(`subscription-${action}-empty-url`, "error", `${actionLabel}失败`, "URL 不能为空。", "/proxy-providers/url"),
      ]);
      appendLog(`${actionLabel}失败：URL 不能为空`);
      return;
    }

    setSubscriptionActionFindings([]);
    setSubscriptionRefreshState(action === "test" ? "testing" : "refreshing");
    try {
      const result = await refreshSubscriptionUrl({
        url: subscriptionUrl,
        name: subscriptionName,
        nativeFetchImpl: isTauriRuntime()
          ? ({ url, profile, timeoutMs }) => fetchSubscriptionWithNativeClient(url, profile, timeoutMs)
          : undefined,
      });
      const parseErrors = result.parsed.findings.filter((finding) => finding.severity === "error");
      setSubscriptionName(result.name);
      setSubscriptionText(result.content);
      setSubscriptionTraffic(result.parsed.traffic);
      setLastSubscriptionRefresh({
        redactedUrl: result.redactedUrl,
        status: result.status,
        bytes: result.bytes,
        updatedAt: result.updatedAt,
        contentType: result.contentType,
        requestProfileLabel: result.requestProfileLabel,
      });
      setSubscriptionRefreshState(parseErrors.length > 0 ? "error" : "success");
      setSubscriptionActionFindings([
        actionFinding(
          parseErrors.length > 0 ? `subscription-${action}-parse-error` : `subscription-${action}-success`,
          parseErrors.length > 0 ? "error" : "info",
          parseErrors.length > 0 ? `${actionLabel}失败` : action === "test" ? "订阅测试通过" : "订阅刷新成功",
          parseErrors.length > 0
            ? "订阅已返回内容，但无法识别为 Clash/Mihomo YAML 或常见节点链接。"
            : `HTTP ${result.status}，解析到 ${result.parsed.nodes.length} 个节点，内容 ${formatBytes(result.bytes)}。`,
          "/subscription",
        ),
        ...(result.requestProfileLabel && parseErrors.length === 0
          ? [
              actionFinding(
                `subscription-${action}-profile`,
                "info",
                "命中的测试方式",
                result.requestProfileLabel,
                "/subscription/request-profile",
              ),
            ]
          : []),
      ]);
      appendLog(`${parseErrors.length > 0 ? `${actionLabel}失败` : `${actionLabel}成功`}：${result.redactedUrl}，节点 ${result.parsed.nodes.length}`);
    } catch (error) {
      setSubscriptionRefreshState("error");
      const message = sanitizeSubscriptionError(error, subscriptionUrl);
      setSubscriptionActionFindings([
        actionFinding(`subscription-${action}-error`, "error", `${actionLabel}失败`, message, "/proxy-providers/url"),
      ]);
      appendLog(`${actionLabel}失败：${message}`);
    }
  }

  async function testSubscription() {
    await loadSubscriptionFromUrl("test");
  }

  async function refreshSubscription() {
    await loadSubscriptionFromUrl("refresh");
  }

  function importSubscriptionNodes() {
    const nodes = subscription?.nodes ?? [];
    if (nodes.length === 0) {
      setSubscriptionActionFindings([
        actionFinding("subscription-import-empty", "error", "订阅节点导入失败", "没有可导入节点。请先刷新订阅并确认解析结果。", "/subscription"),
      ]);
      appendLog("订阅节点导入失败：没有可导入节点");
      return;
    }

    const result = importSubscriptionNodesToYaml(documentState.content, nodes);
    const blockingError = result.findings.find((finding) => finding.severity === "error");
    if (blockingError) {
      setSubscriptionActionFindings(result.findings);
      appendLog(`${blockingError.title}：${blockingError.message}`);
      return;
    }

    updateContent(result.yaml);
    setSubscriptionActionFindings([
      actionFinding(
        "subscription-import-success",
        "info",
        "订阅节点已导入",
        `新增 ${result.summary.importedCount} 个，跳过重复 ${result.summary.skippedDuplicateCount} 个，加入分组 ${result.summary.addedToGroupCount} 个。`,
        "/proxies",
      ),
      ...result.findings,
    ]);
    appendLog(
      `订阅节点已导入：新增 ${result.summary.importedCount} 个，跳过重复 ${result.summary.skippedDuplicateCount} 个，加入分组 ${result.summary.addedToGroupCount} 个`,
    );
    for (const finding of result.findings.slice(0, 2)) {
      appendLog(`${finding.title}：${finding.message}`);
    }
  }

  function addSubscriptionProvider() {
    const result = upsertProxyProviderInYaml(documentState.content, {
      name: subscriptionName,
      url: subscriptionUrl,
      previousName: selectedProviderName,
    });
    const blockingError = result.findings.find((finding) => finding.severity === "error");
    if (blockingError) {
      setSubscriptionActionFindings(result.findings);
      appendLog(`${blockingError.title}：${blockingError.message}`);
      return;
    }

    updateContent(result.yaml);
    setSubscriptionActionFindings(result.findings);
    setSelectedProviderName(result.summary.providerName);
    appendLog(
      `${result.summary.updatedExisting ? "已更新" : "已写入"}机场订阅：${result.summary.providerName}，URL ${redactConfigUrl(subscriptionUrl)}，加入 ${result.summary.addedToGroupCount} 个分组`,
    );
    for (const finding of result.findings.slice(0, 2)) {
      appendLog(`${finding.title}：${finding.message}`);
    }
  }

  function addSubscriptionProvidersBatch(rawInput: string) {
    const parsed = parseBatchSubscriptionInput(rawInput);
    if (parsed.items.length === 0) {
      const findings = parsed.findings.length > 0
        ? parsed.findings
        : [actionFinding("proxy-provider-batch-empty", "error", "批量订阅写入失败", "没有可写入的订阅 URL。", "/batch-subscriptions")];
      setSubscriptionActionFindings(findings);
      appendLog("批量订阅写入失败：没有可写入的订阅 URL");
      return;
    }

    const result = upsertProxyProvidersInYaml(documentState.content, parsed.items);
    const findings = [...parsed.findings, ...result.findings];
    const blockingError = findings.find((finding) => finding.severity === "error" && result.summary.upsertedCount === 0);
    if (blockingError) {
      setSubscriptionActionFindings(findings);
      appendLog(`${blockingError.title}：${blockingError.message}`);
      return;
    }

    if (result.summary.upsertedCount > 0) {
      updateContent(result.yaml);
      setSelectedProviderName(result.summary.createdCount > 0 ? parsed.items[0]?.name : selectedProviderName);
    }
    setSubscriptionActionFindings(findings);
    appendLog(
      `批量订阅已写入：${result.summary.upsertedCount}/${result.summary.requestedCount} 条，新增 ${result.summary.createdCount}，更新 ${result.summary.updatedCount}`,
    );
  }

  async function refreshSubscriptionProvidersBatch(rawInput: string) {
    const parsed = parseBatchSubscriptionInput(rawInput);
    if (parsed.items.length === 0) {
      const findings = parsed.findings.length > 0
        ? parsed.findings
        : [actionFinding("subscription-batch-refresh-empty", "error", "批量刷新失败", "没有可刷新的订阅 URL。", "/batch-subscriptions")];
      setSubscriptionActionFindings(findings);
      appendLog("批量刷新失败：没有可刷新的订阅 URL");
      return;
    }

    setSubscriptionRefreshState("refreshing");
    setSubscriptionActionFindings(parsed.findings);
    setLastSubscriptionRefresh(undefined);
    setSubscriptionTraffic(undefined);

    const nodes: ProxyNode[] = [];
    const findings: Finding[] = [...parsed.findings];
    let successCount = 0;
    let failedCount = 0;

    for (const item of parsed.items) {
      try {
        const result = await refreshSubscriptionUrl({
          url: item.url,
          name: item.name,
          nativeFetchImpl: isTauriRuntime()
            ? ({ url, profile, timeoutMs }) => fetchSubscriptionWithNativeClient(url, profile, timeoutMs)
            : undefined,
        });
        successCount += 1;
        nodes.push(...result.parsed.nodes);
        findings.push(
          actionFinding(
            `subscription-batch-refresh-success-${item.lineNumber}`,
            result.parsed.nodes.length > 0 ? "info" : "warning",
            `${item.name} 刷新完成`,
            `来源 ${result.redactedUrl}，解析到 ${result.parsed.nodes.length} 个节点。`,
            `/batch-subscriptions/${item.lineNumber}`,
          ),
          ...result.parsed.findings.map((finding) => ({
            ...finding,
            id: `batch-${item.lineNumber}-${finding.id}`,
            title: `${item.name}：${finding.title}`,
            path: `/batch-subscriptions/${item.lineNumber}`,
          })),
        );
      } catch (error) {
        failedCount += 1;
        findings.push(
          actionFinding(
            `subscription-batch-refresh-error-${item.lineNumber}`,
            "error",
            `${item.name} 刷新失败`,
            `${item.redactedUrl}：${sanitizeSubscriptionError(error, item.url)}`,
            `/batch-subscriptions/${item.lineNumber}`,
          ),
        );
      }
    }

    setSubscriptionName("批量订阅");
    setSubscriptionText(exportProxyNodesYaml(nodes));
    setSubscriptionRefreshState(failedCount > 0 || nodes.length === 0 ? "error" : "success");
    setSubscriptionActionFindings([
      actionFinding(
        "subscription-batch-refresh-summary",
        failedCount > 0 ? "warning" : "info",
        "批量刷新完成",
        `请求 ${parsed.items.length} 条订阅，成功 ${successCount} 条，失败 ${failedCount} 条，合并 ${nodes.length} 个节点。`,
        "/batch-subscriptions",
      ),
      ...findings,
    ]);
    appendLog(`批量刷新完成：成功 ${successCount}，失败 ${failedCount}，节点 ${nodes.length}`);
  }

  function deleteSubscriptionProvider() {
    if (!selectedProviderName) {
      setSubscriptionActionFindings([
        actionFinding("proxy-provider-delete-no-selection", "error", "删除订阅失败", "请先选择当前 YAML 中的订阅。", "/proxy-providers"),
      ]);
      appendLog("删除订阅失败：请先选择 YAML 中的订阅");
      return;
    }

    const result = deleteProxyProviderFromYaml(documentState.content, selectedProviderName);
    const blockingError = result.findings.find((finding) => finding.severity === "error");
    if (blockingError) {
      setSubscriptionActionFindings(result.findings);
      appendLog(`${blockingError.title}：${blockingError.message}`);
      return;
    }

    updateContent(result.yaml);
    setSubscriptionActionFindings(result.findings);
    const nextSelection = createProviderDraftSelection();
    setSelectedProviderName(nextSelection.selectedProviderName);
    setSubscriptionName(nextSelection.subscriptionName);
    setSubscriptionUrl(nextSelection.subscriptionUrl);
    appendLog(`已删除机场订阅：${result.summary.providerName}，移除引用 ${result.summary.removedFromGroupCount ?? 0} 个`);
    for (const finding of result.findings.slice(0, 2)) {
      appendLog(`${finding.title}：${finding.message}`);
    }
  }

  function applyLeakProtection() {
    const result = applyLeakProtectionToYaml(documentState.content);
    const blockingError = result.findings.find((finding) => finding.severity === "error");
    if (blockingError) {
      appendLog(`${blockingError.title}：${blockingError.message}`);
      return;
    }

    updateContent(result.yaml);
    appendLog(
      `已应用 DNS/IP 防泄露优化：规则 ${result.summary.ruleChangedCount} 条，DNS ${result.summary.dnsChanged ? "已调整" : "无需调整"}`,
    );
    for (const finding of result.findings.slice(0, 2)) {
      appendLog(`${finding.title}：${finding.message}`);
    }
  }

  async function checkProvidersRemote() {
    setProviderCheckState("checking");
    try {
      const summary = await checkRemoteProviders(analysis.value);
      setProviderCheckSummary(summary);
      setProviderCheckState("done");
      const okCount = summary.results.filter((result) => result.status === "ok").length;
      appendLog(
        summary.targets.length === 0
          ? "远程 provider 检查完成：当前 YAML 没有可检查目标"
          : `远程 provider 检查完成：${okCount}/${summary.targets.length} 可访问`,
      );
    } catch (error) {
      setProviderCheckState("error");
      appendLog(`远程 provider 检查失败：${String(error instanceof Error ? error.message : error)}`);
    }
  }

  function applyRuleEdit(result: RuleEditResult, successMessage: string): boolean {
    const blockingError = result.findings.find((finding) => finding.severity === "error");
    if (blockingError) {
      appendLog(`${blockingError.title}：${blockingError.message}`);
      return false;
    }

    updateContent(result.yaml);
    appendLog(successMessage);
    for (const finding of result.findings.slice(0, 2)) {
      appendLog(`${finding.title}：${finding.message}`);
    }
    return true;
  }

  function addRule(draft: RuleDraft) {
    try {
      applyRuleEdit(addRuleToYaml(documentState.content, draft), "已添加分流规则");
    } catch (error) {
      appendLog(`添加规则失败：${String(error instanceof Error ? error.message : error)}`);
    }
  }

  function upsertWebsiteRule(draft: WebsiteRuleDraft): boolean {
    try {
      return applyRuleEdit(upsertWebsiteRuleInYaml(documentState.content, draft), "已应用网站分流规则");
    } catch (error) {
      appendLog(`添加网站分流失败：${String(error instanceof Error ? error.message : error)}`);
      return false;
    }
  }

  function deleteRule(index: number) {
    applyRuleEdit(deleteRuleFromYaml(documentState.content, index), `已删除第 ${index + 1} 条规则`);
  }

  function moveRule(index: number, direction: -1 | 1) {
    applyRuleEdit(moveRuleInYaml(documentState.content, index, direction), direction < 0 ? "规则已上移" : "规则已下移");
  }

  function applyRuleTemplate(templateId: string, targetGroup: string) {
    try {
      applyRuleEdit(applyRuleTemplateToYaml(documentState.content, templateId, targetGroup), "已应用规则模板");
    } catch (error) {
      appendLog(`应用模板失败：${String(error instanceof Error ? error.message : error)}`);
    }
  }

  function importRules(rawInput: string) {
    try {
      applyRuleEdit(importRulesToYaml(documentState.content, rawInput), "已批量导入分流规则");
    } catch (error) {
      appendLog(`批量导入规则失败：${String(error instanceof Error ? error.message : error)}`);
    }
  }

  function commentRules(indexes: number[]) {
    try {
      applyRuleEdit(commentRulesInYaml(documentState.content, indexes), "已批量注释分流规则");
    } catch (error) {
      appendLog(`批量注释规则失败：${String(error instanceof Error ? error.message : error)}`);
    }
  }

  function applyNodeEdit(result: NodeEditResult, successMessage: string) {
    const blockingError = result.findings.find((finding) => finding.severity === "error");
    if (blockingError) {
      appendLog(`${blockingError.title}：${blockingError.message}`);
      return;
    }

    updateContent(result.yaml);
    appendLog(successMessage);
    for (const finding of result.findings.slice(0, 2)) {
      appendLog(`${finding.title}：${finding.message}`);
    }
  }

  function renameNode(oldName: string, newName: string) {
    applyNodeEdit(renameProxyNodeInYaml(documentState.content, oldName, newName), "已重命名节点");
  }

  function disableNodes(nodeNames: string[]) {
    applyNodeEdit(disableProxyNodesInYaml(documentState.content, nodeNames), `已禁用 ${nodeNames.length} 个节点`);
  }

  function addNodesToGroup(nodeNames: string[], groupName: string) {
    applyNodeEdit(addProxyNodesToGroupInYaml(documentState.content, nodeNames, groupName), `已将筛选节点加入「${groupName}」`);
  }

  function appendLog(message: string) {
    setLogs((current) => [`${new Date().toLocaleTimeString()} ${message}`, ...current].slice(0, 8));
  }

  function switchLanguage() {
    const nextLanguage: UiLanguage = language === "zh" ? "en" : "zh";
    setLanguageState(nextLanguage);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch {
      // localStorage can be unavailable in hardened WebView settings.
    }
  }

  return (
    <main
      className={isDropActive ? "app-shell drop-active" : "app-shell"}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(event) => {
        void handleBrowserDrop(event);
      }}
    >
      {isDropActive && (
        <div className="drop-overlay" aria-hidden="true">
          <div>
            <Upload size={22} />
            <strong>{copy.dropOpen}</strong>
            <span>.yaml / .yml</span>
          </div>
        </div>
      )}
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">
            <Braces size={22} />
          </div>
          <div>
            <strong>YAML Proxy</strong>
            <span>OpenClash Workbench</span>
          </div>
        </div>
        <div className="language-control" aria-label={copy.languageLabel}>
          <span>{copy.languageLabel}</span>
          <button type="button" onClick={switchLanguage} title={copy.languageSwitchTitle}>
            {copy.languageButton}
          </button>
        </div>
        <nav className="nav-list" aria-label={copy.mainNav}>
          {NAV_ITEMS.map(([id, Icon]) => {
            const label = copy.nav[id];
            return (
              <button
                className={activePage === id ? "nav-item active" : "nav-item"}
                key={id}
                type="button"
                onClick={() => setActivePage(id)}
                title={label}
              >
                <Icon size={17} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
        <SidebarYamlIndex
          copy={copy}
          formatSummary={analysis.formatSummary}
          structure={analysis.clash.structure}
          onNavigate={setActivePage}
        />
        <CreatorSignature copy={copy} />
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="file-meta">
            <span className={documentState.dirty ? "status-dot dirty" : "status-dot"} />
            <div>
              <strong>{documentState.name}</strong>
              <span>{documentState.path ?? copy.builtinSample}</span>
            </div>
          </div>
          <div className="toolbar">
            <select
              className="template-select"
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value as YamlTemplateId)}
              title={copy.templateTitle}
              aria-label={copy.templateTitle}
            >
              {YAML_TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <button type="button" title={copy.newTitle} onClick={createNewDocument}>
              <Plus size={16} />
              <span>{copy.newAction}</span>
            </button>
            <button type="button" title={copy.openTitle} onClick={openDocument}>
              <FolderOpen size={16} />
              <span>{copy.openAction}</span>
            </button>
            <button type="button" title={copy.saveTitle} onClick={() => saveDocument(false)}>
              <Save size={16} />
              <span>{copy.saveAction}</span>
            </button>
            <button type="button" title={copy.saveAsTitle} onClick={() => saveDocument(true)}>
              <Upload size={16} />
              <span>{copy.saveAsAction}</span>
            </button>
            <button type="button" title={copy.formatTitle} onClick={formatDocument}>
              <RefreshCcw size={16} />
              <span>{copy.formatAction}</span>
            </button>
          </div>
        </header>

        <DocumentTabStrip
          tabs={documentTabs}
          activeId={activeDocumentId}
          closeLabel={copy.closeTab}
          onSelect={setActiveDocumentId}
          onClose={closeDocumentById}
        />

        <input
          ref={fileInputRef}
          hidden
          multiple
          type="file"
          accept=".yaml,.yml"
          onChange={(event) => {
            void handleBrowserFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        {activePage === "editor" && (
          <EditorPage
            content={documentState.content}
            onChange={updateContent}
            findings={allFindings}
            logs={logs}
          />
        )}
        {activePage === "subscriptions" && (
          <SubscriptionPage
            url={subscriptionUrl}
            onUrlChange={updateSubscriptionUrl}
            name={subscriptionName}
            onNameChange={updateSubscriptionName}
            providers={analysis.clash.proxyProviders}
            selectedProviderName={selectedProviderName}
            onProviderSelect={selectSubscriptionProvider}
            onNewProvider={createSubscriptionProviderDraft}
            onTest={testSubscription}
            onRefresh={refreshSubscription}
            onAddProvider={addSubscriptionProvider}
            onBatchAddProviders={addSubscriptionProvidersBatch}
            onBatchRefresh={refreshSubscriptionProvidersBatch}
            onDeleteProvider={deleteSubscriptionProvider}
            onImportNodes={importSubscriptionNodes}
            refreshState={subscriptionRefreshState}
            lastRefresh={lastSubscriptionRefresh}
            nodeCount={subscription?.nodes.length ?? 0}
            traffic={subscription?.traffic}
            findings={subscriptionPageFindings}
            providerPreviewYaml={subscriptionProviderPreview}
          />
        )}
        {activePage === "nodes" && (
          <NodesPage
            nodes={nodesWithGroups}
            providers={analysis.clash.proxyProviders}
            groups={analysis.clash.proxyGroups}
            findings={mergedNodes.findings}
            onRename={renameNode}
            onDisable={disableNodes}
            onAddToGroup={addNodesToGroup}
          />
        )}
        {activePage === "rules" && (
          <RulesPage
            rules={analysis.clash.rules}
            groups={analysis.clash.proxyGroups}
            findings={analysis.clash.findings.filter((finding) => finding.path?.startsWith("/rules"))}
            onWebsiteRule={upsertWebsiteRule}
            onAdd={addRule}
            onDelete={deleteRule}
            onMove={moveRule}
            onTemplate={applyRuleTemplate}
            onImport={importRules}
            onComment={commentRules}
          />
        )}
        {activePage === "dns" && (
          <DnsPage
            findings={analysis.clash.findings.filter((finding) => finding.path?.startsWith("/dns") || finding.title.includes("泄露") || finding.id.includes("ipv6"))}
            onApply={applyLeakProtection}
          />
        )}
        {activePage === "openclash" && (
          <OpenClashPage
            result={openClashExport}
            compatibilityFindings={openClashCompatibility}
            logText={openClashLogText}
            logFindings={openClashLogFindings}
            providerCheckState={providerCheckState}
            providerCheckSummary={providerCheckSummary}
            onLogChange={setOpenClashLogText}
            onCheckProviders={checkProvidersRemote}
            onApply={() => {
              updateContent(openClashExport.yaml);
              appendLog("已应用 OpenClash 导出预览");
            }}
          />
        )}
      </section>
    </main>
  );
}

function DocumentTabStrip({
  tabs,
  activeId,
  closeLabel,
  onSelect,
  onClose,
}: {
  tabs: DocumentTab[];
  activeId: string;
  closeLabel: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}) {
  return (
    <div className="document-tabs" role="tablist" aria-label="YAML 文档标签">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div className={active ? "document-tab active" : "document-tab"} key={tab.id}>
            <button
              type="button"
              className="document-tab-main"
              role="tab"
              aria-selected={active}
              title={tab.path ?? tab.name}
              onClick={() => onSelect(tab.id)}
            >
              <span className={tab.dirty ? "status-dot dirty" : "status-dot"} />
              <strong>{tab.name}</strong>
            </button>
              <button
              type="button"
              className="document-tab-close"
              disabled={tabs.length <= 1}
              title={closeLabel}
              aria-label={`${closeLabel} ${tab.name}`}
              onClick={() => onClose(tab.id)}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

const SIDEBAR_SECTION_TARGETS: Record<string, PageId> = {
  "proxy-providers": "subscriptions",
  proxies: "nodes",
  "proxy-groups": "nodes",
  rules: "rules",
  dns: "dns",
  "rule-providers": "openclash",
  tun: "dns",
};

function SidebarYamlIndex({
  copy,
  formatSummary,
  structure,
  onNavigate,
}: {
  copy: (typeof UI_COPY)[UiLanguage];
  formatSummary: YamlFormatSummary;
  structure: Array<{ id: string; label: string; count?: number; path: string }>;
  onNavigate: (page: PageId) => void;
}) {
  return (
    <section className="sidebar-yaml-index" aria-label={copy.currentYaml}>
      <header>
        <span>{copy.currentYaml}</span>
        <strong>{formatSummary.dialect}</strong>
      </header>
      <div className="sidebar-format-card">
        <span>{copy.rootType}: {formatRootKindLabel(formatSummary.rootKind)}</span>
        <span>{copy.topLevelFields}: {formatSummary.topLevelKeys.length}</span>
        {formatSummary.duplicateKeyCount > 0 && <em>{copy.duplicateKey}: {formatSummary.duplicateKeyCount}</em>}
      </div>
      <div className="sidebar-structure-list" aria-label="结构统计">
        {structure.map((node) => {
          const target = SIDEBAR_SECTION_TARGETS[node.id] ?? "editor";
          return (
            <button type="button" key={node.id} onClick={() => onNavigate(target)} title={copy.openSection(node.label)}>
              <b>{node.label}</b>
              <strong>{node.count ?? 0}</strong>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CreatorSignature({ copy }: { copy: (typeof UI_COPY)[UiLanguage] }) {
  return (
    <section className="creator-signature" aria-label={copy.creatorAria}>
      <header>
        <UserRound size={15} />
        <span>{copy.creatorTitle}</span>
      </header>
      <strong>{CREATOR_INFO.name}</strong>
      <a href={CREATOR_INFO.website} target="_blank" rel="noreferrer" title={copy.websiteTitle}>
        <ExternalLink size={14} />
        <span>{CREATOR_INFO.website}</span>
      </a>
      <a href={`mailto:${CREATOR_INFO.email}`} title={copy.emailTitle(CREATOR_INFO.email)}>
        <Mail size={14} />
        <span>{CREATOR_INFO.email}</span>
      </a>
    </section>
  );
}

function Dashboard({ analysis, findings }: { analysis: ReturnType<typeof analyzeYaml>; findings: Finding[] }) {
  const metrics = [
    ["节点", analysis.clash.proxyCount, Network],
    ["订阅", analysis.clash.proxyProviderCount, Globe2],
    ["分组", analysis.clash.proxyGroupCount, Boxes],
    ["规则", analysis.clash.ruleCount, ListChecks],
    ["DNS", analysis.clash.dnsEnabled ? "启用" : "未启用", ShieldAlert],
    ["问题", findings.length, AlertTriangle],
  ] as const;

  return (
    <div className="page dashboard-grid">
      {metrics.map(([label, value, Icon]) => (
        <section className="metric-card" key={label}>
          <Icon size={19} />
          <span>{label}</span>
          <strong>{value}</strong>
        </section>
      ))}
      <section className="wide-panel">
        <PanelHeader icon={<Activity size={18} />} title="当前检查结果" />
        <FindingList findings={findings} />
      </section>
    </div>
  );
}

function EditorPage({
  content,
  onChange,
  findings,
  logs,
}: {
  content: string;
  onChange: (value: string) => void;
  findings: Finding[];
  logs: string[];
}) {
  const [advancedEditorEnabled, setAdvancedEditorEnabled] = useState(false);

  return (
    <div className="page editor-grid">
      <section className="editor-panel">
        <div className="editor-mode-bar">
          <button
            type="button"
            className={advancedEditorEnabled ? "active" : ""}
            onClick={() => setAdvancedEditorEnabled(true)}
            disabled={advancedEditorEnabled}
            title="启用 Monaco 编辑器"
            aria-label="启用 Monaco 编辑器"
          >
            <FileCode2 size={16} />
          </button>
        </div>
        <div className="editor-surface">
          {advancedEditorEnabled ? (
            <Suspense fallback={<div className="editor-loading">YAML 编辑器加载中</div>}>
              <YamlEditor value={content} onChange={onChange} />
            </Suspense>
          ) : (
            <textarea
              className="plain-yaml-editor"
              value={content}
              onChange={(event) => onChange(event.target.value)}
              spellCheck={false}
              aria-label="YAML"
            />
          )}
        </div>
      </section>
      <aside className="right-rail">
        <section className="rail-panel">
          <PanelHeader icon={<AlertTriangle size={18} />} title="审计结果" />
          <FindingList findings={findings} compact />
        </section>
      </aside>
      <section className="bottom-log">
        <PanelHeader icon={<Clock3 size={18} />} title="任务与日志" />
        {logs.map((log) => (
          <span key={log}>{log}</span>
        ))}
      </section>
    </div>
  );
}

function formatRootKindLabel(kind: YamlFormatSummary["rootKind"]): string {
  if (kind === "object") return "对象";
  if (kind === "array") return "列表";
  if (kind === "scalar") return "标量";
  if (kind === "empty") return "空文件";
  return "不可读";
}

function SubscriptionPage({
  url,
  onUrlChange,
  name,
  onNameChange,
  providers,
  selectedProviderName,
  onProviderSelect,
  onNewProvider,
  onTest,
  onRefresh,
  onAddProvider,
  onBatchAddProviders,
  onBatchRefresh,
  onDeleteProvider,
  onImportNodes,
  refreshState,
  lastRefresh,
  nodeCount,
  traffic,
  findings,
  providerPreviewYaml,
}: {
  url: string;
  onUrlChange: (value: string) => void;
  name: string;
  onNameChange: (value: string) => void;
  providers: ProxyProvider[];
  selectedProviderName?: string;
  onProviderSelect: (name: string) => void;
  onNewProvider: () => void;
  onTest: () => void;
  onRefresh: () => void;
  onAddProvider: () => void;
  onBatchAddProviders: (rawInput: string) => void;
  onBatchRefresh: (rawInput: string) => void;
  onDeleteProvider: () => void;
  onImportNodes: () => void;
  refreshState: SubscriptionRemoteState;
  lastRefresh?: {
    redactedUrl: string;
    status: number;
    bytes: number;
    updatedAt: string;
    contentType?: string;
    requestProfileLabel?: string;
  };
  nodeCount: number;
  traffic?: SubscriptionParseResult["traffic"];
  findings: Finding[];
  providerPreviewYaml: string;
}) {
  const isBusy = refreshState === "refreshing" || refreshState === "testing";
  const [batchInput, setBatchInput] = useState("");
  return (
    <div className="page split-page">
      <section className="work-panel">
        <div className="panel-actions">
          <PanelHeader icon={<Download size={18} />} title="YAML 订阅" />
          <div className="panel-action-group">
            <button type="button" onClick={onNewProvider} disabled={isBusy} title="新增一个 proxy-provider 草稿">
              <Plus size={16} />
              <span>新增</span>
            </button>
            <button type="button" onClick={onTest} disabled={isBusy} title="测试当前订阅 URL 是否可访问并可解析">
              <SearchCheck size={16} />
              <span>{refreshState === "testing" ? "测试中" : "测试订阅"}</span>
            </button>
            <button type="button" onClick={onRefresh} disabled={isBusy} title="刷新订阅 URL">
              <RefreshCcw size={16} />
              <span>{refreshState === "refreshing" ? "刷新中" : "刷新"}</span>
            </button>
            <button type="button" onClick={onAddProvider} disabled={isBusy} title="写入 proxy-providers 机场订阅">
              <Save size={16} />
              <span>{selectedProviderName ? "保存订阅" : "写入订阅"}</span>
            </button>
            <button type="button" onClick={onDeleteProvider} disabled={isBusy || !selectedProviderName} title="从当前 YAML 删除选中的 proxy-provider">
              <Trash2 size={16} />
              <span>删除</span>
            </button>
            <button type="button" onClick={onImportNodes} disabled={isBusy || nodeCount === 0} title="导入订阅节点到当前 YAML">
              <Upload size={16} />
              <span>导入节点</span>
            </button>
          </div>
        </div>
        <ProviderEditorList
          providers={providers}
          selectedProviderName={selectedProviderName}
          onProviderSelect={onProviderSelect}
        />
        <div className="subscription-controls">
          <label>
            <span>名称</span>
            <input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="订阅名称" />
          </label>
          <label>
            <span>URL</span>
            <input value={url} onChange={(event) => onUrlChange(event.target.value)} placeholder="粘贴机场订阅 URL" />
          </label>
        </div>
        <div className="subscription-provider-preview">
          <header>
            <span>写入预览</span>
            <strong>{selectedProviderName ? "修改已有订阅" : "新增订阅"}</strong>
          </header>
          <pre>{providerPreviewYaml}</pre>
        </div>
        <PanelHeader icon={<Download size={18} />} title="批量订阅" />
        <textarea
          className="batch-subscription-input"
          value={batchInput}
          onChange={(event) => setBatchInput(event.target.value)}
          placeholder={"机场A https://example.com/sub?token=...\n机场B, https://example.net/api/v1/client/subscribe?token=..."}
          spellCheck={false}
        />
        <div className="batch-subscription-actions">
          <button type="button" onClick={() => onBatchAddProviders(batchInput)} disabled={isBusy || !batchInput.trim()} title="把多条订阅 URL 写入当前 YAML 的 proxy-providers">
            <Save size={16} />
            <span>批量写入</span>
          </button>
          <button type="button" onClick={() => onBatchRefresh(batchInput)} disabled={isBusy || !batchInput.trim()} title="逐条刷新订阅并合并解析结果，之后可导入节点">
            <RefreshCcw size={16} />
            <span>{refreshState === "refreshing" ? "批量刷新中" : "批量刷新"}</span>
          </button>
        </div>
        {findings.length > 0 && <FindingList findings={findings} compact />}
      </section>
      <section className="work-panel">
        <PanelHeader icon={<Network size={18} />} title="解析结果" />
        <div className="big-number">{nodeCount}</div>
        <div className="subscription-meta">
          <span>
            状态：
            {refreshState === "idle"
              ? "未测试"
              : refreshState === "testing"
                ? "测试中"
                : refreshState === "refreshing"
                  ? "刷新中"
                  : refreshState === "success"
                    ? "成功"
                    : "失败"}
          </span>
          {lastRefresh && <span>来源：{lastRefresh.redactedUrl}</span>}
          {lastRefresh && <span>HTTP：{lastRefresh.status} / {formatBytes(lastRefresh.bytes)}</span>}
          {lastRefresh?.requestProfileLabel && <span>方式：{lastRefresh.requestProfileLabel}</span>}
          {lastRefresh?.contentType && <span>类型：{lastRefresh.contentType}</span>}
          {traffic && (
            <span>
              流量：{formatBytes(traffic.upload ?? 0)} 上传 / {formatBytes(traffic.download ?? 0)} 下载 / {formatBytes(traffic.total ?? 0)} 总量
            </span>
          )}
        </div>
        <FindingList findings={findings} />
      </section>
    </div>
  );
}

function ProviderEditorList({
  providers,
  selectedProviderName,
  onProviderSelect,
}: {
  providers: ProxyProvider[];
  selectedProviderName?: string;
  onProviderSelect: (name: string) => void;
}) {
  if (providers.length === 0) {
    return (
      <div className="provider-editor-empty">
        <span>当前 YAML 没有 proxy-providers，可填写名称和 URL 后写入订阅。</span>
      </div>
    );
  }

  return (
    <div className="provider-editor-list" aria-label="当前 YAML 的订阅 provider">
      {providers.map((provider) => (
        <button
          type="button"
          className={provider.name === selectedProviderName ? "provider-editor-row active" : "provider-editor-row"}
          key={provider.name}
          onClick={() => onProviderSelect(provider.name)}
          title={provider.url ?? provider.name}
        >
          <div>
            <strong>{provider.name}</strong>
            <span>{provider.url ? redactConfigUrl(provider.url) : "未配置 URL"}</span>
          </div>
          <em>
            {provider.type}
            {provider.usedBy.length > 0 ? ` · ${provider.usedBy.length} 组` : ""}
          </em>
        </button>
      ))}
    </div>
  );
}

function NodesPage({
  nodes,
  providers,
  groups,
  findings,
  onRename,
  onDisable,
  onAddToGroup,
}: {
  nodes: ProxyNode[];
  providers: ProxyProvider[];
  groups: ProxyGroup[];
  findings: Finding[];
  onRename: (oldName: string, newName: string) => void;
  onDisable: (nodeNames: string[]) => void;
  onAddToGroup: (nodeNames: string[], groupName: string) => void;
}) {
  const [filter, setFilter] = useState<NodeFilter>({});
  const normalizedNodes = useMemo(() => normalizeProxyNodes(nodes), [nodes]);
  const filteredNodes = useMemo(() => filterProxyNodes(normalizedNodes, filter), [filter, normalizedNodes]);
  const filterOptions = useMemo(() => getNodeFilterOptions(normalizedNodes), [normalizedNodes]);
  const [selectedId, setSelectedId] = useState<string>();
  const selectedNode = filteredNodes.find((node) => node.id === selectedId) ?? filteredNodes[0];
  const [renameValue, setRenameValue] = useState("");
  const [targetGroupName, setTargetGroupName] = useState("");
  const [exportFormat, setExportFormat] = useState<NodeSubscriptionExportFormat>("clash-yaml");
  const [exportCopyStatus, setExportCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const nodeExport = useMemo(() => buildNodeSubscriptionExport(filteredNodes, exportFormat), [exportFormat, filteredNodes]);

  useEffect(() => {
    if (!selectedId || !filteredNodes.some((node) => node.id === selectedId)) {
      setSelectedId(filteredNodes[0]?.id);
    }
  }, [filteredNodes, selectedId]);

  useEffect(() => {
    setRenameValue(selectedNode?.name ?? "");
  }, [selectedNode?.id, selectedNode?.name]);

  useEffect(() => {
    if (!groups.some((group) => group.name === targetGroupName)) {
      setTargetGroupName(groups[0]?.name ?? "");
    }
  }, [groups, targetGroupName]);

  useEffect(() => {
    setExportCopyStatus("idle");
  }, [nodeExport.content]);

  const canRename = selectedNode?.subscriptionName === "local";
  const filteredNodeNames = filteredNodes.map((node) => node.name);

  async function copyNodeExport() {
    try {
      await navigator.clipboard.writeText(nodeExport.content);
      setExportCopyStatus("copied");
    } catch {
      setExportCopyStatus("failed");
    }
  }

  return (
    <div className="page table-page">
      <section className="work-panel">
        <PanelHeader icon={<Network size={18} />} title="节点" />
        <NodeProviderSourceList providers={providers} />
        <div className="node-filters">
          <input
            value={filter.keyword ?? ""}
            onChange={(event) => setFilter((current) => ({ ...current, keyword: event.target.value }))}
            placeholder="按名称、服务器、订阅筛选"
          />
          <select value={filter.type ?? ""} onChange={(event) => setFilter((current) => ({ ...current, type: event.target.value || undefined }))}>
            <option value="">全部协议</option>
            {filterOptions.types.map((type) => (
              <option value={type} key={type}>
                {type}
              </option>
            ))}
          </select>
          <select value={filter.region ?? ""} onChange={(event) => setFilter((current) => ({ ...current, region: event.target.value || undefined }))}>
            <option value="">全部地区</option>
            {filterOptions.regions.map((region) => (
              <option value={region} key={region}>
                {region}
              </option>
            ))}
          </select>
          <select value={filter.rate ?? ""} onChange={(event) => setFilter((current) => ({ ...current, rate: event.target.value || undefined }))}>
            <option value="">全部倍率</option>
            {filterOptions.rates.map((rate) => (
              <option value={rate} key={rate}>
                {rate}
              </option>
            ))}
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>协议</th>
              <th>服务器</th>
              <th>端口</th>
              <th>地区</th>
              <th>倍率</th>
              <th>分组</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            {filteredNodes.map((node) => (
              <tr className={selectedNode?.id === node.id ? "selected-row" : undefined} key={node.id} onClick={() => setSelectedId(node.id)}>
                <td>{node.name}</td>
                <td>{node.type}</td>
                <td>{node.server ?? "-"}</td>
                <td>{node.port ?? "-"}</td>
                <td>{node.region ?? "-"}</td>
                <td>{node.rate ?? "-"}</td>
                <td>{node.groups?.join(", ") || "-"}</td>
                <td>{node.subscriptionName ?? "local"}</td>
              </tr>
            ))}
            {filteredNodes.length === 0 && (
              <tr>
                <td colSpan={8}>没有符合筛选条件的节点</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <section className="work-panel">
        <PanelHeader icon={<Settings size={18} />} title="节点操作" />
        <div className="node-actions">
          <span>筛选结果：{filteredNodes.length} / {nodes.length}</span>
          <label>
            <span>当前节点</span>
            <input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} disabled={!selectedNode} />
          </label>
          <label>
            <span>目标分组</span>
            <select value={targetGroupName} onChange={(event) => setTargetGroupName(event.target.value)} disabled={groups.length === 0}>
              {groups.length === 0 ? (
                <option value="">无可用分组</option>
              ) : (
                groups.map((group) => (
                  <option value={group.name} key={group.name}>
                    {group.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <button
            type="button"
            className="primary-action"
            disabled={!selectedNode || !canRename || renameValue.trim() === selectedNode.name}
            onClick={() => selectedNode && onRename(selectedNode.name, renameValue)}
            title={canRename ? "重命名本地 YAML 节点" : "订阅节点需要先导入到本地 YAML 后再重命名"}
          >
            <Save size={16} />
            <span>重命名</span>
          </button>
          <button
            type="button"
            className="table-button action-button"
            disabled={filteredNodes.length === 0 || !targetGroupName}
            onClick={() => onAddToGroup(filteredNodeNames, targetGroupName)}
            title="把当前筛选结果加入目标分组"
          >
            <Plus size={16} />
            <span>加入分组</span>
          </button>
          <button type="button" className="table-button" disabled={filteredNodes.length === 0} onClick={() => onDisable(filteredNodeNames)}>
            禁用筛选结果
          </button>
        </div>
        <div className="panel-actions export-panel-actions">
          <PanelHeader icon={<Download size={18} />} title="导出 / 转换" />
          <button type="button" onClick={() => void copyNodeExport()} disabled={!nodeExport.content} title="复制当前导出内容">
            <Copy size={16} />
            <span>{exportCopyStatus === "copied" ? "已复制" : exportCopyStatus === "failed" ? "复制失败" : "复制"}</span>
          </button>
        </div>
        <div className="export-format-controls">
          <label>
            <span>目标格式</span>
            <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as NodeSubscriptionExportFormat)}>
              <option value="clash-yaml">Clash / Mihomo YAML</option>
              <option value="clash-provider-yaml">Clash Verge / OpenClash Provider</option>
              <option value="share-links">V2Ray / Hiddify 分享链接</option>
              <option value="share-links-base64">V2Ray / Hiddify Base64 订阅</option>
            </select>
          </label>
          <span>{nodeExport.label}：导出 {nodeExport.exportedCount} 个，跳过 {nodeExport.skippedCount} 个</span>
        </div>
        <pre className="mini-code">{nodeExport.content}</pre>
        {nodeExport.findings.length > 0 && <FindingList findings={nodeExport.findings} compact />}
        <PanelHeader icon={<CheckCircle2 size={18} />} title="合并记录" />
        <FindingList findings={findings} />
      </section>
    </div>
  );
}

function NodeProviderSourceList({ providers }: { providers: ProxyProvider[] }) {
  if (providers.length === 0) return null;

  return (
    <div className="node-provider-sources" aria-label="当前 YAML 订阅源">
      {providers.map((provider) => (
        <article className="node-provider-source-row" key={provider.name} title={provider.url ?? provider.name}>
          <div>
            <strong>{provider.name}</strong>
            <span>{provider.url ? redactConfigUrl(provider.url) : "未配置 URL"}</span>
          </div>
          <em>
            {provider.type}
            {provider.usedBy.length > 0 ? ` · ${provider.usedBy.length} 组` : ""}
          </em>
        </article>
      ))}
    </div>
  );
}

function RulesPage({
  rules,
  groups,
  findings,
  onWebsiteRule,
  onAdd,
  onDelete,
  onMove,
  onTemplate,
  onImport,
  onComment,
}: {
  rules: RuleItem[];
  groups: ProxyGroup[];
  findings: Finding[];
  onWebsiteRule: (draft: WebsiteRuleDraft) => boolean;
  onAdd: (draft: RuleDraft) => void;
  onDelete: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onTemplate: (templateId: string, targetGroup: string) => void;
  onImport: (rawInput: string) => void;
  onComment: (indexes: number[]) => void;
}) {
  type RuleToolTab = "website" | "advanced" | "batch" | "templates";
  const targetOptions = useMemo(() => {
    const builtIns = ["DIRECT", "REJECT", "GLOBAL"];
    return Array.from(new Set([...groups.map((group) => group.name), ...builtIns]));
  }, [groups]);
  const defaultTarget = targetOptions[0] ?? "DIRECT";
  const [draft, setDraft] = useState<RuleDraft>({
    type: "DOMAIN-SUFFIX",
    value: "",
    target: defaultTarget,
    noResolve: false,
  });
  const [websiteDraft, setWebsiteDraft] = useState<WebsiteRuleDraft>({
    website: "",
    scope: "suffix",
    target: defaultTarget,
    priority: "top",
  });
  const [activeToolTab, setActiveToolTab] = useState<RuleToolTab>("website");
  const [ruleFilter, setRuleFilter] = useState("");
  const [bulkRules, setBulkRules] = useState("");
  const [selectedRuleIndexes, setSelectedRuleIndexes] = useState<number[]>([]);
  const selectedRuleSet = useMemo(() => new Set(selectedRuleIndexes), [selectedRuleIndexes]);
  const ruleSignature = useMemo(() => rules.map((rule) => `${rule.index}:${rule.raw}`).join("\u0000"), [rules]);

  useEffect(() => {
    setDraft((current) =>
      targetOptions.includes(current.target) ? current : { ...current, target: defaultTarget },
    );
    setWebsiteDraft((current) =>
      targetOptions.includes(current.target) ? current : { ...current, target: defaultTarget },
    );
  }, [defaultTarget, targetOptions]);

  useEffect(() => {
    const selectable = new Set(rules.filter((rule) => rule.type !== "MATCH").map((rule) => rule.index));
    setSelectedRuleIndexes((current) => current.filter((index) => selectable.has(index)));
  }, [ruleSignature, rules]);

  const showValueInput = draft.type !== "MATCH";
  const showNoResolve = draft.type === "IP-CIDR" || draft.type === "IP-CIDR6" || draft.type === "GEOIP";
  const commentableRuleIndexes = rules.filter((rule) => rule.type !== "MATCH").map((rule) => rule.index);
  const normalizedRuleFilter = ruleFilter.trim().toLowerCase();
  const visibleRules = normalizedRuleFilter
    ? rules.filter((rule) => rule.raw.toLowerCase().includes(normalizedRuleFilter))
    : rules;
  const visibleCommentableRuleIndexes = visibleRules
    .filter((rule) => rule.type !== "MATCH")
    .map((rule) => rule.index);
  const allCommentableSelected =
    visibleCommentableRuleIndexes.length > 0 &&
    visibleCommentableRuleIndexes.every((index) => selectedRuleSet.has(index));
  const websiteRuleCount = rules.filter((rule) => rule.type === "DOMAIN" || rule.type === "DOMAIN-SUFFIX").length;
  const websitePreview = useMemo(() => {
    try {
      return { value: buildWebsiteRulePreview(websiteDraft), error: undefined };
    } catch (error) {
      return {
        value: undefined,
        error: websiteDraft.website.trim()
          ? String(error instanceof Error ? error.message : error)
          : undefined,
      };
    }
  }, [websiteDraft]);

  function toggleRuleSelection(index: number, checked: boolean) {
    setSelectedRuleIndexes((current) => {
      if (checked) {
        return current.includes(index) ? current : [...current, index];
      }
      return current.filter((item) => item !== index);
    });
  }

  function toggleAllCommentable(checked: boolean) {
    setSelectedRuleIndexes((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...visibleCommentableRuleIndexes]));
      }
      const visibleSet = new Set(visibleCommentableRuleIndexes);
      return current.filter((index) => !visibleSet.has(index));
    });
  }

  function commentSelectedRules() {
    onComment(selectedRuleIndexes);
    setSelectedRuleIndexes([]);
  }

  function submitWebsiteRule() {
    if (!websitePreview.value) return;
    if (onWebsiteRule(websiteDraft)) {
      setWebsiteDraft((current) => ({ ...current, website: "" }));
    }
  }

  return (
    <div className="page table-page rules-page">
      <section className="work-panel rule-list-panel">
        <div className="panel-actions">
          <PanelHeader icon={<ListChecks size={18} />} title="分流规则" />
          <div className="panel-action-group">
            <label className="rule-filter-field">
              <SearchCheck size={15} />
              <input
                value={ruleFilter}
                onChange={(event) => setRuleFilter(event.target.value)}
                placeholder="筛选规则"
                aria-label="筛选规则"
              />
            </label>
            <button type="button" onClick={commentSelectedRules} disabled={selectedRuleIndexes.length === 0} title="批量注释选中规则">
              <Hash size={16} />
              <span>注释选中</span>
            </button>
          </div>
        </div>
        <div className="rule-overview" aria-label="规则概览">
          <span><strong>{rules.length}</strong> 条规则</span>
          <span><strong>{websiteRuleCount}</strong> 条网站规则</span>
          <span><strong>{targetOptions.length}</strong> 个可选策略</span>
          {normalizedRuleFilter && <span><strong>{visibleRules.length}</strong> 条匹配</span>}
        </div>
        <div className="rule-table-scroll">
          <table className="rules-table">
            <thead>
              <tr>
                <th className="rule-selection-cell">
                  <input
                    type="checkbox"
                    aria-label="选择全部可注释规则"
                    checked={allCommentableSelected}
                    disabled={visibleCommentableRuleIndexes.length === 0}
                    onChange={(event) => toggleAllCommentable(event.target.checked)}
                  />
                </th>
                <th className="rule-index-cell">#</th>
                <th className="rule-type-cell">类型</th>
                <th>匹配</th>
                <th className="rule-target-cell">目标</th>
                <th className="rule-action-cell">操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleRules.map((rule) => {
                const isWebsiteRule = rule.type === "DOMAIN" || rule.type === "DOMAIN-SUFFIX";
                return (
                  <tr key={`${rule.index}-${rule.raw}`} className={isWebsiteRule ? "website-rule-row" : undefined}>
                    <td className="rule-selection-cell">
                      <input
                        type="checkbox"
                        aria-label={`选择第 ${rule.index + 1} 条规则`}
                        checked={selectedRuleSet.has(rule.index)}
                        disabled={rule.type === "MATCH"}
                        onChange={(event) => toggleRuleSelection(rule.index, event.target.checked)}
                      />
                    </td>
                    <td>{rule.index + 1}</td>
                    <td><span className={`rule-type-badge${isWebsiteRule ? " website" : ""}`}>{rule.type}</span></td>
                    <td className="rule-value-cell" title={rule.value || undefined}>{rule.value || "-"}</td>
                    <td className="rule-target-value" title={rule.target}>{rule.target ?? "-"}</td>
                    <td>
                      <div className="table-actions">
                        <button type="button" title="上移" onClick={() => onMove(rule.index, -1)} disabled={rule.index === 0}>
                          <ArrowUp size={14} />
                        </button>
                        <button type="button" title="下移" onClick={() => onMove(rule.index, 1)} disabled={rule.index >= rules.length - 1}>
                          <ArrowDown size={14} />
                        </button>
                        <button type="button" title="删除" onClick={() => onDelete(rule.index)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleRules.length === 0 && (
                <tr>
                  <td colSpan={6}>{rules.length === 0 ? "暂无 rules。" : "没有匹配的规则。"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="work-panel rule-tool-panel">
        <div className="rule-tool-tabs" role="tablist" aria-label="规则工具">
          {([
            ["website", "网站"],
            ["advanced", "高级"],
            ["batch", "批量"],
            ["templates", "模板"],
          ] as const).map(([id, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeToolTab === id}
              className={activeToolTab === id ? "active" : undefined}
              onClick={() => setActiveToolTab(id)}
              key={id}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="rule-tool-body">
          {activeToolTab === "website" && (
            <div className="rule-tool-section website-rule-form">
              <PanelHeader icon={<Globe2 size={18} />} title="网站分流" />
              <label>
                <span>网站</span>
                <input
                  value={websiteDraft.website}
                  onChange={(event) => setWebsiteDraft((current) => ({ ...current, website: event.target.value }))}
                  placeholder="example.com 或完整 URL"
                  spellCheck={false}
                  autoCapitalize="none"
                />
              </label>
              <fieldset className="rule-choice-group">
                <legend>匹配范围</legend>
                <div className="rule-choice-control">
                  <button
                    type="button"
                    className={websiteDraft.scope === "exact" ? "active" : undefined}
                    onClick={() => setWebsiteDraft((current) => ({ ...current, scope: "exact" }))}
                    title="仅匹配当前 hostname"
                  >
                    仅此域名
                  </button>
                  <button
                    type="button"
                    className={websiteDraft.scope === "suffix" ? "active" : undefined}
                    onClick={() => setWebsiteDraft((current) => ({ ...current, scope: "suffix" }))}
                    title="匹配当前域名及其子域名"
                  >
                    含子域名
                  </button>
                </div>
              </fieldset>
              <label>
                <span>适用策略</span>
                <select
                  value={websiteDraft.target}
                  onChange={(event) => setWebsiteDraft((current) => ({ ...current, target: event.target.value }))}
                >
                  {targetOptions.map((target) => (
                    <option value={target} key={target}>{target}</option>
                  ))}
                </select>
              </label>
              <fieldset className="rule-choice-group">
                <legend>优先级</legend>
                <div className="rule-choice-control">
                  <button
                    type="button"
                    className={websiteDraft.priority === "top" ? "active" : undefined}
                    onClick={() => setWebsiteDraft((current) => ({ ...current, priority: "top" }))}
                    title="放到规则顶部"
                  >
                    优先
                  </button>
                  <button
                    type="button"
                    className={websiteDraft.priority === "before-match" ? "active" : undefined}
                    onClick={() => setWebsiteDraft((current) => ({ ...current, priority: "before-match" }))}
                    title="放到 MATCH 前"
                  >
                    普通
                  </button>
                </div>
              </fieldset>
              <div className={`website-rule-preview${websitePreview.error ? " error" : ""}`} aria-live="polite">
                <span>YAML 规则</span>
                <code>{websitePreview.value?.raw ?? websitePreview.error ?? "DOMAIN-SUFFIX,example.com,策略"}</code>
              </div>
              <button
                type="button"
                className="primary-action"
                onClick={submitWebsiteRule}
                disabled={!websitePreview.value}
              >
                <Plus size={16} />
                <span>应用网站规则</span>
              </button>
            </div>
          )}

          {activeToolTab === "advanced" && (
            <div className="rule-tool-section">
              <PanelHeader icon={<Settings size={18} />} title="高级规则" />
              <div className="rule-form">
                <label>
                  <span>类型</span>
                  <select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}>
                    {SUPPORTED_RULE_TYPES.map((type) => (
                      <option value={type} key={type}>{type}</option>
                    ))}
                  </select>
                </label>
                {showValueInput && (
                  <label>
                    <span>匹配值</span>
                    <input
                      value={draft.value ?? ""}
                      onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))}
                      placeholder="domain / geosite / cidr"
                    />
                  </label>
                )}
                <label>
                  <span>目标</span>
                  <select value={draft.target} onChange={(event) => setDraft((current) => ({ ...current, target: event.target.value }))}>
                    {targetOptions.map((target) => (
                      <option value={target} key={target}>{target}</option>
                    ))}
                  </select>
                </label>
                {showNoResolve && (
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={draft.noResolve ?? false}
                      onChange={(event) => setDraft((current) => ({ ...current, noResolve: event.target.checked }))}
                    />
                    no-resolve
                  </label>
                )}
                <button type="button" className="primary-action" onClick={() => onAdd(draft)}>
                  <Plus size={16} />
                  <span>添加高级规则</span>
                </button>
              </div>
            </div>
          )}

          {activeToolTab === "batch" && (
            <div className="rule-tool-section">
              <PanelHeader icon={<Upload size={18} />} title="批量导入" />
              <textarea
                className="bulk-rule-input"
                value={bulkRules}
                onChange={(event) => setBulkRules(event.target.value)}
                placeholder={"DOMAIN-SUFFIX,example.com,节点选择\nDOMAIN-KEYWORD,openai,节点选择"}
              />
              <button type="button" className="primary-action" onClick={() => onImport(bulkRules)} disabled={!bulkRules.trim()}>
                <Upload size={16} />
                <span>导入规则</span>
              </button>
            </div>
          )}

          {activeToolTab === "templates" && (
            <div className="rule-tool-section">
              <PanelHeader icon={<WandSparkles size={18} />} title="规则模板" />
              <label className="template-target-field">
                <span>适用策略</span>
                <select
                  value={draft.target}
                  onChange={(event) => setDraft((current) => ({ ...current, target: event.target.value }))}
                >
                  {targetOptions.map((target) => (
                    <option value={target} key={target}>{target}</option>
                  ))}
                </select>
              </label>
              <div className="template-list">
                {RULE_TEMPLATES.map((template) => (
                  <button type="button" key={template.id} onClick={() => onTemplate(template.id, draft.target)} title={template.description}>
                    <span>{template.name}</span>
                    <em>{template.description}</em>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rule-findings-section">
          <PanelHeader icon={<AlertTriangle size={18} />} title="规则检查" />
          <FindingList findings={findings} compact />
        </div>
      </section>
    </div>
  );
}

function FindingPage({ title, findings }: { title: string; findings: Finding[] }) {
  return (
    <div className="page">
      <section className="work-panel">
        <PanelHeader icon={<ShieldAlert size={18} />} title={title} />
        <FindingList findings={findings} />
      </section>
    </div>
  );
}

function DnsPage({ findings, onApply }: { findings: Finding[]; onApply: () => void }) {
  return (
    <div className="page split-page">
      <section className="work-panel">
        <div className="panel-actions">
          <PanelHeader icon={<ShieldAlert size={18} />} title="DNS / Fake-IP 审计" />
          <button type="button" onClick={onApply} title="应用 DNS、IP 和泄露测试规则优化">
            <WandSparkles size={16} />
            <span>一键优化</span>
          </button>
        </div>
        <FindingList findings={findings} />
      </section>
      <section className="work-panel">
        <PanelHeader icon={<ListChecks size={18} />} title="写入内容" />
        <div className="hardening-list">
          <span>dns.enable / fake-ip / fallback-filter</span>
          <span>nameserver-policy 泄露测试域名</span>
          <span>IPv6 关闭与 TUN strict-route</span>
          <span>私有 IP、GEOIP CN、泄露测试规则</span>
        </div>
      </section>
    </div>
  );
}

function OpenClashPage({
  result,
  compatibilityFindings,
  logText,
  logFindings,
  providerCheckState,
  providerCheckSummary,
  onLogChange,
  onCheckProviders,
  onApply,
}: {
  result: OpenClashExportResult;
  compatibilityFindings: Finding[];
  logText: string;
  logFindings: Finding[];
  providerCheckState: "idle" | "checking" | "done" | "error";
  providerCheckSummary?: ProviderRemoteCheckSummary;
  onLogChange: (value: string) => void;
  onCheckProviders: () => void;
  onApply: () => void;
}) {
  return (
    <div className="page split-page">
      <section className="work-panel">
        <div className="panel-actions">
          <PanelHeader icon={<SearchCheck size={18} />} title="OpenClash 导出" />
          <button type="button" onClick={onApply} title="应用导出预览">
            <Upload size={16} />
            <span>应用</span>
          </button>
        </div>
        <div className="export-metrics">
          <div>
            <span>节点</span>
            <strong>{result.summary.proxyCount}</strong>
          </div>
          <div>
            <span>分组</span>
            <strong>{result.summary.proxyGroupCount}</strong>
          </div>
          <div>
            <span>规则</span>
            <strong>{result.summary.ruleCount}</strong>
          </div>
        </div>
        <PanelHeader icon={<SearchCheck size={18} />} title="兼容性检查" />
        <FindingList findings={compatibilityFindings} />
        <div className="panel-actions provider-check-actions">
          <PanelHeader icon={<Radar size={18} />} title="远程 provider 检查" />
          <button type="button" onClick={onCheckProviders} disabled={providerCheckState === "checking"} title="检查当前 YAML 中的远程 provider">
            <RefreshCcw size={16} />
            <span>{providerCheckState === "checking" ? "检查中" : "检查"}</span>
          </button>
        </div>
        <ProviderCheckList state={providerCheckState} summary={providerCheckSummary} />
        <PanelHeader icon={<FileCode2 size={18} />} title="启动日志诊断" />
        <textarea
          className="log-input"
          value={logText}
          onChange={(event) => onLogChange(event.target.value)}
          placeholder="粘贴 OpenClash 启动失败日志"
          spellCheck={false}
        />
        <FindingList findings={logFindings} />
        <PanelHeader icon={<AlertTriangle size={18} />} title="导出修正" />
        <FindingList findings={result.findings} />
      </section>
      <section className="work-panel code-panel">
        <PanelHeader icon={<FileCode2 size={18} />} title="导出预览" />
        <pre>{result.yaml}</pre>
      </section>
    </div>
  );
}

function ProviderCheckList({
  state,
  summary,
}: {
  state: "idle" | "checking" | "done" | "error";
  summary?: ProviderRemoteCheckSummary;
}) {
  if (state === "checking") {
    return (
      <div className="empty-state provider-check-empty">
        <Radar size={18} />
        <span>正在检查远程 provider</span>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="empty-state provider-check-empty">
        <Radar size={18} />
        <span>尚未检查</span>
      </div>
    );
  }

  const okCount = summary.results.filter((result) => result.status === "ok").length;
  const warningCount = summary.results.filter((result) => result.status === "warning").length;
  const errorCount = summary.results.filter((result) => result.status === "error").length;

  return (
    <div className="provider-check-list">
      <div className="provider-check-summary">
        <span className="status-badge">目标 {summary.targets.length}</span>
        <span className="status-badge ok">成功 {okCount}</span>
        <span className="status-badge warning">异常 {warningCount}</span>
        <span className="status-badge error">失败 {errorCount}</span>
      </div>
      {summary.results.length === 0 ? (
        <div className="empty-state provider-check-empty">
          <CheckCircle2 size={18} />
          <span>没有可检查的远程 provider</span>
        </div>
      ) : (
        summary.results.map((result) => (
          <article className={`provider-check-row ${result.status}`} key={result.id}>
            <div>
              <strong>{result.name}</strong>
              <span>{result.section}</span>
            </div>
            <span title={result.redactedUrl}>{result.redactedUrl}</span>
            <em>{formatProviderCheckResult(result)}</em>
            <span className={`status-badge ${result.status}`}>{formatProviderCheckStatus(result.status)}</span>
          </article>
        ))
      )}
      {summary.findings.length > 0 && <FindingList findings={summary.findings} compact />}
    </div>
  );
}

function PanelHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="panel-header">
      {icon}
      <strong>{title}</strong>
    </div>
  );
}

function FindingList({ findings, compact = false }: { findings: Finding[]; compact?: boolean }) {
  if (findings.length === 0) {
    return (
      <div className="empty-state">
        <CheckCircle2 size={18} />
        <span>未发现问题</span>
      </div>
    );
  }

  return (
    <div className={compact ? "finding-list compact" : "finding-list"}>
      {findings.map((finding) => (
        <article className={`finding ${finding.severity}`} key={finding.id}>
          <strong>{finding.title}</strong>
          <span>{finding.message}</span>
          {finding.suggestion && <em>{finding.suggestion}</em>}
        </article>
      ))}
    </div>
  );
}

function formatProviderCheckStatus(status: "ok" | "warning" | "error"): string {
  if (status === "ok") return "成功";
  if (status === "warning") return "异常";
  return "失败";
}

function formatProviderCheckResult(result: ProviderRemoteCheckSummary["results"][number]): string {
  const parts = [
    result.httpStatus ? `HTTP ${result.httpStatus}` : undefined,
    result.contentFormat ? formatProviderContentFormat(result.contentFormat, result.itemCount) : undefined,
    result.bytes !== undefined ? formatBytes(result.bytes) : undefined,
    `${result.durationMs} ms`,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : result.message;
}

function formatProviderContentFormat(format: NonNullable<ProviderRemoteCheckSummary["results"][number]["contentFormat"]>, itemCount?: number): string {
  const suffix = itemCount !== undefined ? ` ${itemCount}` : "";
  if (format === "proxy-yaml") return `代理 YAML${suffix}`;
  if (format === "proxy-uri-list") return `代理链接${suffix}`;
  if (format === "rule-yaml") return `规则 YAML${suffix}`;
  if (format === "rule-text") return `文本规则${suffix}`;
  if (format === "rule-mrs") return "MRS 规则";
  if (format === "empty") return "空响应";
  return "未知结构";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}
