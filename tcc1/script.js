"use strict";

const CATEGORIES = [
  { id: "perguntas", label: "Perguntas", icon: "question", type: "Pergunta" },
  { id: "reclamacoes", label: "Reclamações", icon: "complaint", type: "Reclamação" },
  { id: "sugestoes", label: "Sugestões", icon: "idea", type: "Sugestão" },
];

const state = {
  student: null,
  messages: [],
  currentCategory: "perguntas",
  categoryCounts: { perguntas: 0, reclamacoes: 0, sugestoes: 0 },
  search: "",
  loadingMessages: false,
  historyRequestId: 0,
  historyError: "",
  sending: false,
  authenticating: false,
  authVersion: 0,
};

const elements = {
  authScreen: document.querySelector("#authScreen"),
  portalScreen: document.querySelector("#portalScreen"),
  loginForm: document.querySelector("#loginForm"),
  registerForm: document.querySelector("#registerForm"),
  forgotForm: document.querySelector("#forgotForm"),
  forgotSuccess: document.querySelector("#forgotSuccess"),
  categoryNav: document.querySelector("#categoryNav"),
  categoryTitle: document.querySelector("#categoryTitle"),
  historySearch: document.querySelector("#historySearch"),
  messageList: document.querySelector("#messageList"),
  messageForm: document.querySelector("#messageForm"),
  messageInput: document.querySelector("#messageInput"),
  sendButton: document.querySelector("#sendButton"),
  studentName: document.querySelector("#studentName"),
  studentClass: document.querySelector("#studentClass"),
  studentAvatar: document.querySelector("#studentAvatar"),
  mobileMenuButton: document.querySelector("#mobileMenuButton"),
  sidebar: document.querySelector("#portalSidebar"),
  sidebarOverlay: document.querySelector("#sidebarOverlay"),
  toast: document.querySelector("#toast"),
  refreshButton: document.querySelector("#studentRefreshButton"),
  logoutButton: document.querySelector("#studentLogoutButton"),
};

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  bindEvents();
  const version = state.authVersion;
  const user = await getCurrentUser();
  if (version !== state.authVersion) return;
  if (user) {
    enterAuthenticatedArea(user);
  } else {
    showLogin();
  }
}

function bindEvents() {
  document.querySelectorAll("[data-auth-view]").forEach((button) => {
    button.addEventListener("click", () => setAuthView(button.dataset.authView));
  });

  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => togglePassword(button));
  });

  elements.loginForm.addEventListener("submit", handleLogin);
  elements.registerForm.addEventListener("submit", handleRegistration);
  elements.forgotForm.addEventListener("submit", handleForgotPassword);
  elements.messageForm.addEventListener("submit", handleMessageSubmit);
  elements.messageInput.addEventListener("input", updateSendButton);
  elements.refreshButton.addEventListener("click", loadMessageHistory);
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.historySearch.addEventListener("input", debounce(() => {
    state.search = elements.historySearch.value.trim();
    loadMessageHistory();
  }, 250));

  elements.mobileMenuButton.addEventListener("click", () => {
    toggleMobileMenu(!elements.sidebar.classList.contains("is-open"));
  });
  elements.sidebarOverlay.addEventListener("click", () => toggleMobileMenu(false));

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) toggleMobileMenu(false);
    elements.sidebar.inert = window.innerWidth <= 760 && !elements.sidebar.classList.contains("is-open");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") toggleMobileMenu(false);
    if (event.key !== "Tab" || !elements.sidebar.classList.contains("is-open")) return;
    const controls = [...elements.sidebar.querySelectorAll("button:not(:disabled)")];
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  window.addEventListener("pagehide", () => { elements.portalScreen.hidden = true; });
  window.addEventListener("pageshow", async (event) => {
    if (!event.persisted) return;
    elements.portalScreen.hidden = true;
    const version = ++state.authVersion;
    const user = await getCurrentUser();
    if (version !== state.authVersion) return;
    if (user) enterAuthenticatedArea(user);
    else showLogin();
  });
  document.querySelectorAll(".form-field input").forEach((input) => {
    input.required = true;
    input.setAttribute("aria-describedby", `${input.id}Error`);
    document.querySelector(`[data-error-for='${input.id}']`).id = `${input.id}Error`;
  });
}

function setAuthView(view) {
  const forms = {
    login: elements.loginForm,
    register: elements.registerForm,
    forgot: elements.forgotForm,
  };
  const nextForm = forms[view];
  if (!nextForm) return;

  Object.values(forms).forEach((form) => {
    form.classList.toggle("is-hidden", form !== nextForm);
    clearErrors(form);
  });

  elements.forgotSuccess.hidden = true;
  requestAnimationFrame(() => nextForm.querySelector("input")?.focus());
}

async function handleLogin(event) {
  event.preventDefault();
  if (state.authenticating) return;
  clearErrors(elements.loginForm);

  const identity = valueOf("loginIdentity");
  const password = document.getElementById("loginPassword").value;
  let hasError = false;

  if (!identity) {
    setError("loginIdentity", "Informe seu RA ou e-mail.");
    hasError = true;
  }
  if (!password) {
    setError("loginPassword", "Informe sua senha.");
    hasError = true;
  }

  if (hasError) return;

  state.authenticating = true;
  ++state.authVersion;
  setFormBusy(elements.loginForm, true);
  try {
    const result = await requestApi("/api/auth/login", {
      identidade: identity,
      senha: password,
      lembrarMe: document.querySelector("#rememberMe").checked,
    });
    enterAuthenticatedArea(result.user);
  } catch (error) {
    setError("loginPassword", error.message);
  } finally {
    state.authenticating = false;
    setFormBusy(elements.loginForm, false);
  }
}

async function handleRegistration(event) {
  event.preventDefault();
  if (state.authenticating) return;
  clearErrors(elements.registerForm);

  const fields = {
    name: valueOf("registerName"),
    ra: valueOf("registerRa"),
    classroom: valueOf("registerClass"),
    email: valueOf("registerEmail"),
    password: document.getElementById("registerPassword").value,
    confirmPassword: document.getElementById("registerConfirmPassword").value,
  };
  let hasError = false;

  if (!fields.name) hasError = setError("registerName", "Informe seu nome completo.") || hasError;
  if (!fields.ra) hasError = setError("registerRa", "Informe seu RA.") || hasError;
  else if (isEmail(fields.ra)) hasError = setError("registerRa", "Informe um RA válido, não um e-mail.") || hasError;
  if (!fields.classroom) hasError = setError("registerClass", "Informe sua série ou turma.") || hasError;
  if (!fields.email) {
    hasError = setError("registerEmail", "Informe seu e-mail institucional.") || hasError;
  } else if (!isEmail(fields.email)) {
    hasError = setError("registerEmail", "Informe um e-mail válido.") || hasError;
  }
  if (!fields.password) {
    hasError = setError("registerPassword", "Crie uma senha.") || hasError;
  } else if (fields.password.length < 8) {
    hasError = setError("registerPassword", "Use pelo menos 8 caracteres.") || hasError;
  }
  if (!fields.confirmPassword) {
    hasError = setError("registerConfirmPassword", "Confirme sua senha.") || hasError;
  } else if (fields.password !== fields.confirmPassword) {
    hasError = setError("registerConfirmPassword", "As senhas não coincidem.") || hasError;
  }

  if (hasError) return;

  state.authenticating = true;
  ++state.authVersion;
  setFormBusy(elements.registerForm, true);
  try {
    const result = await requestApi("/api/auth/register", {
      nome: fields.name,
      ra: fields.ra,
      turma: fields.classroom,
      email: fields.email,
      senha: fields.password,
      confirmacaoSenha: fields.confirmPassword,
    });
    enterAuthenticatedArea(result.user);
    showToast("Conta criada com sucesso. Boas-vindas ao ConnectClass!");
  } catch (error) {
    applyRegistrationErrors(error);
  } finally {
    state.authenticating = false;
    setFormBusy(elements.registerForm, false);
  }
}

function handleForgotPassword(event) {
  event.preventDefault();
  clearErrors(elements.forgotForm);
  const email = valueOf("forgotEmail");

  if (!email) {
    setError("forgotEmail", "Informe seu e-mail institucional.");
    return;
  }
  if (!isEmail(email)) {
    setError("forgotEmail", "Informe um e-mail válido.");
    return;
  }

  elements.forgotSuccess.textContent = "A recuperação de senha ainda não está disponível. Procure a secretaria escolar.";
  elements.forgotSuccess.hidden = false;
}

function enterAuthenticatedArea(user) {
  if (user.tipo === "gestor") {
    window.location.assign("/gestor");
    return;
  }

  state.student = {
    name: user.nome,
    classroom: user.turma || "Turma não informada",
  };
  state.currentCategory = "perguntas";
  state.search = "";
  state.categoryCounts = { perguntas: 0, reclamacoes: 0, sugestoes: 0 };
  showPortal();
}

function showPortal() {
  window.history.replaceState(null, "", "/aluno");
  elements.authScreen.hidden = true;
  elements.portalScreen.hidden = false;
  elements.historySearch.value = "";
  renderProfile();
  renderNavigation();
  toggleMobileMenu(false);
  loadMessageHistory();
  requestAnimationFrame(() => elements.messageInput.focus());
}

function showLogin() {
  ++state.authVersion;
  state.historyRequestId += 1;
  state.loadingMessages = false;
  elements.refreshButton.disabled = false;
  elements.messageList.removeAttribute("aria-busy");
  state.student = null;
  state.messages = [];
  state.historyError = "";
  elements.messageList.replaceChildren();
  elements.messageInput.value = "";
  elements.loginForm.reset();
  elements.registerForm.reset();
  toggleMobileMenu(false);
  window.history.replaceState(null, "", "/login");
  elements.portalScreen.hidden = true;
  elements.authScreen.hidden = false;
  setAuthView("login");
}

async function handleLogout() {
  if (elements.logoutButton.disabled || state.sending) return;
  elements.logoutButton.disabled = true;
  try {
    await requestApi("/api/auth/logout", {});
    showLogin();
    showToast("Você saiu da sua conta.");
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.logoutButton.disabled = false;
  }
}

function renderNavigation() {
  const focusedCategory = document.activeElement?.dataset.category;
  elements.categoryNav.replaceChildren();

  CATEGORIES.forEach((category) => {
    const button = document.createElement("button");
    const isActive = category.id === state.currentCategory;
    button.type = "button";
    button.className = `category-button${isActive ? " is-active" : ""}`;
    button.setAttribute("aria-current", isActive ? "page" : "false");
    button.dataset.category = category.id;
    button.innerHTML = `${categoryIcon(category.icon)}<span>${escapeHtml(category.label)}</span><span class="category-count" aria-label="${state.categoryCounts[category.id] ?? 0} mensagens">${state.categoryCounts[category.id] ?? 0}</span>`;
    button.addEventListener("click", () => setCategory(category.id));
    elements.categoryNav.append(button);
  });
  if (focusedCategory) elements.categoryNav.querySelector(`[data-category='${focusedCategory}']`)?.focus();
}

function setCategory(categoryId) {
  if (!CATEGORIES.some((category) => category.id === categoryId)) return;
  if (state.currentCategory === categoryId) {
    toggleMobileMenu(false);
    return;
  }
  state.currentCategory = categoryId;
  state.search = "";
  elements.historySearch.value = "";
  renderNavigation();
  toggleMobileMenu(false);
  loadMessageHistory();
}

function renderProfile() {
  elements.studentName.textContent = state.student.name;
  elements.studentClass.textContent = state.student.classroom;
  elements.studentAvatar.textContent = initials(state.student.name);
}

async function loadMessageHistory() {
  if (!state.student) return;
  const requestId = ++state.historyRequestId;
  state.loadingMessages = true;
  state.historyError = "";
  elements.refreshButton.disabled = true;
  elements.messageList.setAttribute("aria-busy", "true");
  renderConversation();

  try {
    const params = new URLSearchParams({ categoria: state.currentCategory });
    if (state.search) params.set("busca", state.search);
    const response = await fetch(`/api/mensagens?${params}`, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(15000) });
    const payload = await response.json();
    if (requestId !== state.historyRequestId) return;
    if (response.status === 401) {
      showLogin();
      return;
    }
    if (!response.ok) throw new ApiError(payload.message || "Não foi possível carregar seu histórico.");
    state.messages = payload.mensagens || [];
    state.categoryCounts = { ...state.categoryCounts, ...(payload.contadores || {}) };
    renderNavigation();
  } catch (error) {
    if (requestId !== state.historyRequestId) return;
    state.messages = [];
    state.historyError = error instanceof ApiError ? error.message : "Não foi possível carregar seu histórico. Tente novamente.";
  } finally {
    if (requestId === state.historyRequestId) {
      state.loadingMessages = false;
      elements.messageList.removeAttribute("aria-busy");
      elements.refreshButton.disabled = false;
      renderConversation();
    }
  }
}

function renderConversation() {
  const category = CATEGORIES.find((item) => item.id === state.currentCategory);
  const messages = state.messages;

  elements.categoryTitle.textContent = category?.label || "Conversa";
  elements.messageInput.placeholder = messagePlaceholder(category?.id);
  elements.messageList.replaceChildren();

  if (state.loadingMessages) {
    elements.messageList.append(createLoadingState());
    return;
  }

  if (state.historyError) {
    const errorState = document.createElement("div");
    errorState.className = "empty-state";
    const content = document.createElement("div");
    const description = document.createElement("p");
    description.textContent = state.historyError;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "history-refresh";
    retry.textContent = "Tentar novamente";
    retry.addEventListener("click", loadMessageHistory);
    content.append(description, retry);
    errorState.append(content);
    elements.messageList.append(errorState);
    return;
  }

  if (!messages.length) {
    elements.messageList.append(createEmptyState());
    return;
  }

  elements.messageList.append(window.ConnectClassUI.createTimeline(messages));
  requestAnimationFrame(() => {
    elements.messageList.scrollTop = elements.messageList.scrollHeight;
  });
}

function createLoadingState() {
  const stateElement = document.createElement("div");
  stateElement.className = "empty-state";
  stateElement.innerHTML = "<div><h3>Carregando mensagens...</h3><p>Aguarde um instante.</p></div>";
  return stateElement;
}

function createEmptyState() {
  const emptyTitle = state.search ? "Nenhuma mensagem encontrada neste tópico." : "Você ainda não possui mensagens neste tópico.";
  const stateElement = document.createElement("div");
  stateElement.className = "empty-state";
  stateElement.innerHTML = `
    <div>
      <div class="empty-state__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><path d="m21 3-7.25 18-3.4-7.35L3 10.25 21 3Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <h3>${emptyTitle}</h3>
      <p>Envie uma mensagem para iniciar o atendimento.</p>
    </div>`;
  return stateElement;
}

async function handleMessageSubmit(event) {
  event.preventDefault();
  const text = elements.messageInput.value.trim();
  if (!text || state.sending) return;
  const category = CATEGORIES.find((item) => item.id === state.currentCategory);

  setMessageFormBusy(true);
  try {
    await requestApi("/api/mensagens", { categoria: category.type, mensagem: text });
    elements.messageInput.value = "";
    state.search = "";
    elements.historySearch.value = "";
    updateSendButton();
    await loadMessageHistory();
    showToast("Mensagem enviada para a secretaria.");
  } catch (error) {
    showToast(error.message);
  } finally {
    setMessageFormBusy(false);
    elements.messageInput.focus();
  }
}

function updateSendButton() {
  elements.sendButton.disabled = state.sending || !elements.messageInput.value.trim();
}

function messagePlaceholder(categoryId) {
  return {
    perguntas: "Digite sua pergunta...",
    reclamacoes: "Descreva sua reclamação...",
    sugestoes: "Digite sua sugestão...",
  }[categoryId] || "Digite sua mensagem...";
}

function togglePassword(button) {
  const input = document.getElementById(button.dataset.passwordToggle);
  if (!input) return;

  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  button.setAttribute("aria-label", isHidden ? "Ocultar senha" : "Mostrar senha");
}

function toggleMobileMenu(open) {
  const wasOpen = elements.sidebar.classList.contains("is-open");
  elements.sidebar.classList.toggle("is-open", open);
  elements.sidebarOverlay.classList.toggle("is-open", open);
  elements.mobileMenuButton.setAttribute("aria-expanded", String(open));
  elements.sidebar.inert = window.innerWidth <= 760 && !open;
  elements.portalScreen.querySelector(".chat-shell").inert = open;
  document.body.classList.toggle("student-menu-open", open);
  if (open) elements.categoryNav.querySelector("[aria-current='page']")?.focus();
  else if (wasOpen) elements.mobileMenuButton.focus();
}

function setError(inputId, message) {
  const input = document.getElementById(inputId);
  const field = input?.closest(".form-field");
  const error = document.querySelector(`[data-error-for="${inputId}"]`);
  if (!field || !error) return false;

  field.classList.add("has-error");
  input.setAttribute("aria-invalid", "true");
  error.textContent = message;
  return true;
}

function clearErrors(form) {
  form.querySelectorAll(".form-field.has-error").forEach((field) => field.classList.remove("has-error"));
  form.querySelectorAll("[aria-invalid='true']").forEach((input) => input.removeAttribute("aria-invalid"));
  form.querySelectorAll(".field-error").forEach((error) => {
    error.textContent = "";
  });
}

function valueOf(inputId) {
  return document.getElementById(inputId).value.trim();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "CC";
}

function categoryIcon(icon) {
  const icons = {
    question: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5Z" stroke="currentColor" stroke-width="1.8"/><path d="M9.7 9.3a2.38 2.38 0 0 1 4.62.78c0 1.58-2.32 1.9-2.32 3.57M12 16.55h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m4.4 19.6 1.1-3.08" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    complaint: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4.25h14v13.5H9.5L5 21V4.25Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 8v4M12 15.5h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    idea: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.4 15.35C7.5 14.36 7 13.03 7 11.55a5 5 0 0 1 10 0c0 1.48-.5 2.81-1.4 3.8-.65.72-1.1 1.12-1.24 2.15H9.64c-.14-1.03-.59-1.43-1.24-2.15Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.7 20h4.6M10.05 17.5h3.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };
  return icons[icon] || icons.question;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

async function getCurrentUser() {
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(15000) });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error();
    const payload = await response.json();
    return payload.user;
  } catch {
    showToast("Não foi possível verificar sua sessão. Tente recarregar a página.");
    return null;
  }
}

async function requestApi(url, body) {
  let response;
  let payload;
  try {
    response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    payload = await response.json();
  } catch {
    throw new ApiError("Não foi possível confirmar a operação. Atualize para conferir o resultado antes de tentar novamente.");
  }

  if (!response.ok) {
    if (response.status === 401 && state.student) showLogin();
    throw new ApiError(payload.message || "Não foi possível concluir a operação.", payload.fields);
  }
  return payload;
}

function applyRegistrationErrors(error) {
  const inputs = {
    nome: "registerName",
    ra: "registerRa",
    turma: "registerClass",
    email: "registerEmail",
    senha: "registerPassword",
    confirmacaoSenha: "registerConfirmPassword",
  };
  const fields = error.fields || {};
  let displayed = false;

  Object.entries(fields).forEach(([field, message]) => {
    if (inputs[field]) {
      setError(inputs[field], message);
      displayed = true;
    }
  });

  if (!displayed) setError("registerEmail", error.message);
}

function setFormBusy(form, busy) {
  form.setAttribute("aria-busy", String(busy));
  form.querySelectorAll("input, button").forEach((element) => {
    element.disabled = busy;
  });
}

function setMessageFormBusy(busy) {
  state.sending = busy;
  elements.messageInput.disabled = busy;
  elements.logoutButton.disabled = busy;
  elements.sendButton.disabled = busy || !elements.messageInput.value.trim();
}

function debounce(callback, wait) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), wait);
  };
}

class ApiError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.fields = fields;
  }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 3600);
}
