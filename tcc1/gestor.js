"use strict";

const CATEGORY_VIEWS = new Set(["perguntas", "reclamacoes", "sugestoes"]);
const STATUSES = ["Pendente", "Em análise", "Respondida", "Resolvida"];
const EMPTY_FILTERS = { busca: "", alunoId: "", turma: "", categoria: "todos", status: "", dataInicial: "", dataFinal: "" };
const state = {
  user: null, dashboard: {}, conversations: [],
  filterOptions: { alunos: [], turmas: [], status: STATUSES },
  filters: { ...EMPTY_FILTERS }, view: "dashboard",
  selectedConversationId: null, selectedMessageId: null, drafts: new Map(),
  loading: true, mutating: false, loggingOut: false, error: "",
};
const elements = Object.fromEntries([
  ["sidebar", "managerSidebar"], ["overlay", "managerSidebarOverlay"], ["menu", "managerMobileMenuButton"],
  ["nav", "managerNav"], ["name", "managerName"], ["avatar", "managerAvatar"],
  ["title", "managerViewTitle"], ["description", "managerViewDescription"],
  ["refresh", "managerRefreshButton"], ["logout", "managerLogoutButton"],
  ["dashboard", "managerDashboard"], ["search", "managerSearch"],
  ["student", "managerStudentFilter"], ["class", "managerClassFilter"],
  ["category", "managerCategoryFilter"], ["status", "managerStatusFilter"],
  ["startDate", "managerStartDate"], ["endDate", "managerEndDate"],
  ["clear", "managerClearFilters"], ["filterDetails", "managerFilterDetails"],
  ["filterCount", "managerFilterCount"], ["listPanel", "managerListPanel"],
  ["list", "managerConversationList"], ["count", "managerConversationCount"],
  ["detail", "managerDetailPanel"], ["feedback", "managerFeedback"],
].map(([key, id]) => [key, document.getElementById(id)]));
const ui = window.ConnectClassUI;
let searchTimer;
let requestNumber = 0;
let requestController;
let menuReturnFocus;

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  if (window.matchMedia("(max-width: 600px)").matches) elements.filterDetails.open = false;
  bindEvents();
  loadManagerData();
}

function bindEvents() {
  elements.nav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-manager-view]");
    if (button) setManagerView(button.dataset.managerView);
  });
  elements.dashboard.addEventListener("click", (event) => {
    const card = event.target.closest("[data-dashboard-filter]");
    if (card) applyDashboardFilter(card.dataset.dashboardFilter);
  });
  elements.refresh.addEventListener("click", () => loadManagerData());
  elements.logout.addEventListener("click", logout);
  elements.clear.addEventListener("click", clearFilters);
  elements.search.addEventListener("input", () => {
    // Store each keystroke before a pending request can finish.
    state.filters.busca = elements.search.value;
    state.selectedMessageId = null;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => loadManagerData(), 250);
  });
  [[elements.student, "alunoId"], [elements.class, "turma"], [elements.category, "categoria"],
    [elements.status, "status"], [elements.startDate, "dataInicial"], [elements.endDate, "dataFinal"]]
    .forEach(([element, field]) => element.addEventListener("change", () => {
      state.filters[field] = element.value;
      state.selectedMessageId = null;
      if (field === "categoria") state.view = element.value;
      loadManagerData();
    }));
  elements.menu.addEventListener("click", () => toggleMobileMenu(!elements.sidebar.classList.contains("is-open")));
  elements.overlay.addEventListener("click", () => toggleMobileMenu(false));
  document.addEventListener("keydown", handleMenuKeys);
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) toggleMobileMenu(false, false);
    updateSidebarAccessibility();
  });
  window.addEventListener("pageshow", (event) => { if (event.persisted) loadManagerData(); });
  window.addEventListener("pagehide", () => {
    // Restored history entries verify the session before showing private data.
    document.body.classList.add("manager-session-checking");
  });
  updateSidebarAccessibility();
}

function setManagerView(view) {
  if (state.mutating) return;
  if (view !== "dashboard" && view !== "todos" && !CATEGORY_VIEWS.has(view)) return;
  showFeedback("");
  state.view = view;
  state.filters.categoria = CATEGORY_VIEWS.has(view) ? view : "todos";
  if (view === "dashboard") state.filters = { ...EMPTY_FILTERS };
  elements.filterDetails.open = view === "dashboard" && window.innerWidth > 600;
  state.selectedConversationId = null;
  state.selectedMessageId = null;
  syncFilterControls();
  toggleMobileMenu(false);
  loadManagerData();
}

function applyDashboardFilter(filter) {
  const statusFilters = { pendentes: "Pendente", emAnalise: "Em análise", respondidas: "Respondida", resolvidas: "Resolvida" };
  state.filters = { ...EMPTY_FILTERS, categoria: CATEGORY_VIEWS.has(filter) ? filter : "todos", status: statusFilters[filter] || "" };
  state.view = state.filters.categoria;
  state.selectedConversationId = null;
  state.selectedMessageId = null;
  syncFilterControls();
  if (state.filters.status) elements.filterDetails.open = true;
  loadManagerData();
}

function clearFilters() {
  showFeedback("");
  state.filters = { ...EMPTY_FILTERS };
  state.view = "todos";
  syncFilterControls();
  loadManagerData();
}

async function loadManagerData() {
  if (state.loggingOut) return;
  window.clearTimeout(searchTimer);
  requestController?.abort();
  requestController = new AbortController();
  const currentRequest = ++requestNumber;
  const controller = requestController;
  const timeout = window.setTimeout(() => controller.abort(new Error("A consulta demorou demais. Tente novamente.")), 15000);
  state.loading = true;
  state.error = "";
  renderHeader();
  renderNavigation();
  renderConversationList();
  elements.refresh.disabled = true;
  elements.detail.setAttribute("aria-busy", "true");
  if (!state.selectedConversationId) renderConversationDetail();
  try {
    const params = new URLSearchParams();
    Object.entries(state.filters).forEach(([key, value]) => {
      if (value && value !== "todos") params.set(key, String(value).trim());
    });
    const payload = await request(`/api/gestor${params.size ? `?${params}` : ""}`, { signal: requestController.signal });
    if (currentRequest !== requestNumber || state.loggingOut) return;
    state.user = payload.user;
    state.dashboard = payload.dashboard || {};
    state.conversations = payload.conversas || [];
    state.filterOptions = payload.filtros || state.filterOptions;
    if (!state.conversations.some((conversation) => conversation.id === state.selectedConversationId)) {
      state.selectedConversationId = null;
      state.selectedMessageId = null;
    }
    document.body.classList.remove("manager-session-checking");
  } catch (error) {
    if (currentRequest !== requestNumber || error.name === "AbortError") return;
    state.conversations = [];
    state.error = error instanceof TypeError ? "Não foi possível carregar as mensagens. Tente novamente." : error.message;
    document.body.classList.remove("manager-session-checking");
  } finally {
    window.clearTimeout(timeout);
    if (currentRequest === requestNumber && !state.loggingOut) {
      state.loading = false;
      render();
    }
  }
}

async function request(url, options = {}) {
  let response;
  let payload;
  try {
    response = await fetch(url, {
      credentials: "same-origin", cache: "no-store", ...options,
      signal: options.signal || AbortSignal.timeout(15000),
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
    });
    payload = await response.json();
  } catch (error) {
    if (options.method) throw new Error("Não foi possível confirmar a operação. Atualize para conferir o resultado antes de tentar novamente.");
    throw error;
  }
  if (response.status === 401 || response.status === 403) {
    clearPrivateView();
    window.location.replace(response.status === 403 ? "/aluno" : "/login");
    throw new Error("Sua sessão não permite acessar este painel.");
  }
  if (!response.ok) throw new Error(payload.message || "Não foi possível concluir a operação. Tente novamente.");
  return payload;
}

function render() {
  if (state.user) {
    elements.name.textContent = state.user.nome;
    elements.avatar.textContent = initials(state.user.nome);
  }
  renderNavigation();
  renderHeader();
  elements.dashboard.hidden = state.view !== "dashboard";
  elements.dashboard.querySelectorAll("[data-metric]").forEach((metric) => {
    metric.textContent = state.dashboard[metric.dataset.metric] ?? 0;
  });
  replaceOptions(elements.student, state.filterOptions.alunos, "Todos os alunos", (student) => ({ value: student.id, label: `${student.nome} · ${student.ra || "RA não informado"}` }));
  replaceOptions(elements.class, state.filterOptions.turmas, "Todas as turmas", (turma) => ({ value: turma, label: turma }));
  replaceOptions(elements.status, state.filterOptions.status, "Todos os status", (status) => ({ value: status, label: status }));
  // Network completion never overwrites text currently being typed.
  syncFilterControls(false);
  renderConversationList();
  renderConversationDetail();
  elements.refresh.disabled = state.mutating;
  elements.detail.setAttribute("aria-busy", "false");
}

function renderNavigation() {
  elements.nav.querySelectorAll("[data-manager-view]").forEach((button) => {
    const active = button.dataset.managerView === state.view;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function renderHeader() {
  const labels = {
    dashboard: ["Dashboard", "Acompanhe os atendimentos da secretaria."],
    todos: ["Todas as mensagens", "Consulte e responda às conversas dos alunos."],
    perguntas: ["Perguntas", "Históricos de perguntas de todos os alunos."],
    reclamacoes: ["Reclamações", "Históricos de reclamações de todos os alunos."],
    sugestoes: ["Sugestões", "Históricos de sugestões de todos os alunos."],
  };
  const [title, description] = labels[state.view] || labels.todos;
  elements.title.textContent = title;
  elements.description.textContent = description;
}

function replaceOptions(element, values, emptyLabel, toOption) {
  element.replaceChildren(createOption("", emptyLabel), ...(values || []).map((value) => {
    const option = toOption(value);
    return createOption(option.value, option.label);
  }));
}

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = String(value);
  option.textContent = label;
  return option;
}

function syncFilterControls(includeSearch = true) {
  if (includeSearch) elements.search.value = state.filters.busca;
  elements.student.value = state.filters.alunoId;
  elements.class.value = state.filters.turma;
  elements.category.value = state.filters.categoria;
  elements.status.value = state.filters.status;
  elements.startDate.value = state.filters.dataInicial;
  elements.endDate.value = state.filters.dataFinal;
  elements.endDate.min = state.filters.dataInicial;
  elements.startDate.max = state.filters.dataFinal;
  const active = Object.entries(state.filters).filter(([key, value]) => key !== "busca" && value && value !== "todos").length;
  elements.filterCount.textContent = active ? `Filtros · ${active} ${active === 1 ? "ativo" : "ativos"}` : "Filtros";
}

function renderConversationList() {
  elements.listPanel.setAttribute("aria-busy", String(state.loading));
  elements.list.replaceChildren();
  elements.count.textContent = `${state.conversations.length} ${state.conversations.length === 1 ? "conversa" : "conversas"}`;
  if (state.loading) return elements.list.append(createState("Carregando mensagens..."));
  if (state.error) return elements.list.append(createState(state.error, true, () => loadManagerData()));
  if (!state.conversations.length) return elements.list.append(createState("Nenhuma mensagem encontrada. Ajuste os filtros ou atualize para consultar novos atendimentos."));
  const fragment = document.createDocumentFragment();
  state.conversations.forEach((conversation) => fragment.append(createConversationButton(conversation)));
  elements.list.append(fragment);
}

function createConversationButton(conversation) {
  const button = node("button", `conversation-item${conversation.id === state.selectedConversationId ? " is-active" : ""}`);
  button.type = "button";
  button.setAttribute("aria-pressed", String(conversation.id === state.selectedConversationId));
  button.addEventListener("click", () => {
    if (state.mutating) return;
    state.selectedConversationId = conversation.id;
    state.selectedMessageId = null;
    renderConversationList();
    renderConversationDetail();
    if (window.innerWidth <= 900) elements.detail.scrollIntoView({ block: "start" });
    elements.detail.querySelector("h3")?.focus({ preventScroll: true });
  });
  const top = node("div", "conversation-item__top");
  const time = node("time", "", formatPreviewTime(conversation.ultimaAtividade));
  time.dateTime = conversation.ultimaAtividade;
  time.title = ui.formatDateTime(conversation.ultimaAtividade);
  top.append(node("strong", "", conversation.aluno.nome), time);
  const identity = node("p", "conversation-item__identity", `${conversation.aluno.ra || "RA não informado"} · ${conversation.aluno.turma || "Turma não informada"}`);
  const message = node("p", "conversation-item__message", conversation.ultimaMensagem);
  const meta = node("div", "conversation-item__meta");
  const matchingStatuses = [...new Set(conversation.mensagens.filter((entry) => conversation.mensagensCorrespondentes?.includes(entry.id)).map((entry) => entry.status))];
  const displayStatus = state.filters.status && matchingStatuses.includes(state.filters.status) ? state.filters.status : conversation.status;
  meta.append(node("span", "message-category", conversation.tipo), node("span", `message-status ${ui.statusClass(displayStatus)}`, displayStatus));
  const summary = node("div", "conversation-summary");
  summary.append(top, message, meta, identity);
  const avatar = node("span", "conversation-avatar", initials(conversation.aluno.nome));
  avatar.setAttribute("aria-hidden", "true");
  button.append(avatar, summary);
  return button;
}

function selectedConversation() {
  return state.conversations.find((item) => item.id === state.selectedConversationId);
}

function renderConversationDetail() {
  elements.detail.replaceChildren();
  const conversation = selectedConversation();
  document.body.classList.toggle("manager-conversation-open", Boolean(conversation) && !state.error);
  if (state.error) return elements.detail.append(createState("Selecione uma conversa após carregar as mensagens."));
  if (!conversation) return elements.detail.append(createState(state.conversations.length ? "Selecione uma conversa para visualizar o histórico e responder." : "As conversas recebidas aparecerão aqui."));
  if (!conversation.mensagens.some((message) => String(message.id) === String(state.selectedMessageId))) {
    state.selectedMessageId = conversation.mensagensCorrespondentes?.at(-1) ?? conversation.mensagens.at(-1)?.id ?? null;
  }
  const header = node("header", "manager-detail-header");
  const back = node("button", "manager-back-button", "← Voltar para conversas");
  back.type = "button";
  back.disabled = state.mutating;
  back.addEventListener("click", () => {
    state.selectedConversationId = null;
    state.selectedMessageId = null;
    renderConversationList();
    renderConversationDetail();
    elements.list.querySelector("button")?.focus();
  });
  const heading = node("h3", "", conversation.aluno.nome);
  heading.tabIndex = -1;
  header.append(back, heading, node("p", "", `${conversation.aluno.ra || "RA não informado"} · ${conversation.aluno.turma || "Turma não informada"} · ${conversation.tipo}`));
  const history = node("div", "manager-message-history");
  history.setAttribute("aria-label", "Histórico da conversa");
  history.tabIndex = 0;
  history.append(ui.createTimeline(conversation.mensagens));
  elements.detail.append(header, history, createActions(conversation));
  requestAnimationFrame(() => { history.scrollTop = history.scrollHeight; });
}

function createActions(conversation) {
  const panel = node("section", "manager-actions");
  panel.setAttribute("aria-label", "Responder e atualizar atendimento");
  const targetLabel = node("label", "manager-action-label", "Mensagem do aluno a atender");
  targetLabel.htmlFor = "managerReplyTarget";
  const target = node("select", "manager-action-input");
  target.id = "managerReplyTarget";
  target.disabled = state.mutating;
  conversation.mensagens.forEach((message) => target.append(createOption(message.id, `#${message.id} · ${ui.formatDateTime(message.dataHora)} · ${message.mensagem}`)));
  target.value = String(state.selectedMessageId);
  target.addEventListener("change", () => {
    state.selectedMessageId = Number(target.value);
    const replacement = createActions(conversation);
    panel.replaceWith(replacement);
    replacement.querySelector("#managerReplyTarget").focus();
  });
  const selected = conversation.mensagens.find((message) => String(message.id) === String(state.selectedMessageId));
  const excerpt = node("p", "manager-target-preview", selected?.mensagem || "");
  const statusForm = node("form", "manager-status-form");
  const statusLabel = node("label", "manager-action-label", "Status da mensagem selecionada");
  statusLabel.htmlFor = "managerMessageStatus";
  const status = node("select", "manager-action-input");
  status.id = "managerMessageStatus";
  STATUSES.forEach((value) => status.append(createOption(value, value)));
  status.value = selected?.status || "Pendente";
  const saveStatus = node("button", "manager-secondary-button", state.mutating ? "Aguarde..." : "Salvar status");
  saveStatus.type = "submit";
  saveStatus.disabled = status.disabled = state.mutating;
  statusForm.append(statusLabel, status, saveStatus);
  statusForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.mutating && status.value !== selected.status) mutateMessage(selected.id, "status", { status: status.value });
    else if (!state.mutating) showFeedback("Este status já está salvo.");
  });
  const replyForm = node("form", "manager-reply-form");
  const replyLabel = node("label", "manager-action-label", "Resposta da secretaria");
  replyLabel.htmlFor = "managerReplyText";
  const reply = node("textarea", "manager-action-input");
  reply.id = "managerReplyText";
  reply.name = "mensagem";
  reply.placeholder = "Escreva uma resposta para este atendimento...";
  reply.rows = 2;
  reply.required = true;
  reply.maxLength = 1000;
  reply.disabled = state.mutating;
  reply.value = state.drafts.get(String(selected.id)) || "";
  const characterCount = node("span", "manager-character-count", `${reply.value.length}/1000`);
  characterCount.id = "managerReplyCount";
  reply.setAttribute("aria-describedby", "managerReplyCount");
  reply.addEventListener("input", () => {
    state.drafts.set(String(selected.id), reply.value);
    reply.setCustomValidity("");
    characterCount.textContent = `${reply.value.length}/1000`;
  });
  const replyFooter = node("div", "manager-reply-footer");
  const send = node("button", "manager-primary-button", state.mutating ? "Salvando..." : "Enviar resposta");
  send.type = "submit";
  send.disabled = state.mutating;
  replyFooter.append(characterCount, send);
  replyForm.append(replyLabel, reply, replyFooter);
  replyForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.mutating) return;
    if (!reply.value.trim()) {
      reply.setCustomValidity("Escreva uma resposta antes de enviar.");
      reply.reportValidity();
      return;
    }
    mutateMessage(selected.id, "respostas", { mensagem: reply.value });
  });
  panel.append(targetLabel, target, excerpt, statusForm, replyForm);
  return panel;
}

async function mutateMessage(messageId, operation, data) {
  if (state.mutating || state.loggingOut) return;
  state.mutating = true;
  setMutationControls(true);
  showFeedback("");
  renderConversationDetail();
  try {
    await request(`/api/gestor/mensagens/${encodeURIComponent(messageId)}/${operation}`, {
      method: operation === "status" ? "PATCH" : "POST", body: JSON.stringify(data),
    });
    if (operation === "respostas") state.drafts.delete(String(messageId));
    showFeedback(operation === "respostas" ? "Resposta enviada. O aluno poderá consultá-la no histórico." : "Status atualizado.");
    await loadManagerData();
  } catch (error) {
    showFeedback(error.message || "Não foi possível salvar. Tente novamente.", true);
  } finally {
    state.mutating = false;
    setMutationControls(false);
    renderConversationDetail();
  }
}

function setMutationControls(busy) {
  elements.logout.disabled = elements.refresh.disabled = busy;
  elements.nav.inert = elements.dashboard.inert = busy;
  elements.search.closest(".manager-search-area").inert = busy;
}

async function logout() {
  if (state.loggingOut || state.mutating) return;
  state.loggingOut = true;
  elements.logout.disabled = true;
  elements.logout.textContent = "Saindo...";
  requestController?.abort();
  ++requestNumber;
  try {
    await request("/api/auth/logout", { method: "POST" });
    clearPrivateView();
    window.location.replace("/login");
  } catch (error) {
    state.loggingOut = false;
    state.loading = false;
    elements.logout.disabled = false;
    elements.logout.textContent = "Sair da conta";
    elements.refresh.disabled = false;
    render();
    showFeedback(error.message || "Não foi possível sair. Tente novamente.", true);
  }
}

function clearPrivateView() {
  state.user = null;
  state.conversations = [];
  state.drafts.clear();
  elements.list.replaceChildren();
  elements.detail.replaceChildren();
  document.body.classList.add("manager-session-checking");
}

function showFeedback(message, error = false) {
  elements.feedback.textContent = message;
  elements.feedback.hidden = !message;
  elements.feedback.classList.toggle("is-error", error);
}

function createState(message, error = false, retry) {
  const container = node("div", `manager-state${error ? " is-error" : ""}`);
  container.append(node("p", "", message));
  if (retry) {
    const button = node("button", "manager-secondary-button", "Tentar novamente");
    button.type = "button";
    button.addEventListener("click", retry);
    container.append(button);
  }
  return container;
}

function toggleMobileMenu(open, restoreFocus = true) {
  if (open) menuReturnFocus = document.activeElement;
  elements.sidebar.classList.toggle("is-open", open);
  elements.overlay.classList.toggle("is-open", open);
  elements.menu.setAttribute("aria-expanded", String(open));
  elements.menu.setAttribute("aria-label", open ? "Fechar menu administrativo" : "Abrir menu administrativo");
  document.body.classList.toggle("manager-menu-open", open);
  updateSidebarAccessibility();
  if (open) elements.nav.querySelector("button")?.focus();
  else if (restoreFocus && menuReturnFocus) {
    menuReturnFocus.focus({ preventScroll: true });
    menuReturnFocus = null;
  }
}

function updateSidebarAccessibility() {
  elements.sidebar.inert = window.innerWidth <= 900 && !elements.sidebar.classList.contains("is-open");
  document.querySelector(".manager-shell").inert = window.innerWidth <= 900 && elements.sidebar.classList.contains("is-open");
}

function handleMenuKeys(event) {
  if (!elements.sidebar.classList.contains("is-open")) return;
  if (event.key === "Escape") { event.preventDefault(); toggleMobileMenu(false); }
  if (event.key !== "Tab") return;
  const controls = [...elements.sidebar.querySelectorAll("button:not(:disabled), a[href]")];
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

function node(tag, className = "", content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function initials(name) {
  return String(name).trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "CC";
}

function formatPreviewTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const calendar = new Intl.DateTimeFormat("en-CA", {timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"});
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (calendar.format(date) === calendar.format(today)) return new Intl.DateTimeFormat("pt-BR", {timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit"}).format(date);
  if (calendar.format(date) === calendar.format(yesterday)) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", {timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit"}).format(date);
}
