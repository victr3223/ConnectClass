"use strict";

// As conversas abaixo preservam temporariamente o layout do protótipo. Elas serão
// substituídas pelos dados reais do backend na Fase 2.
const FALLBACK_DATA = {
  brand: { name: "ConnectClass", portal: "Portal do Aluno" },
  student: { name: "Ana Maria Santos", classroom: "3º Ano - Turma B" },
  categories: [
    { id: "perguntas", label: "Perguntas", icon: "question" },
    { id: "reclamacoes", label: "Reclamações", icon: "complaint" },
    { id: "sugestoes", label: "Sugestões", icon: "idea" },
  ],
  conversations: {
    perguntas: [
      { id: "question-1", text: "Olá! Gostaria de saber quando será divulgado o calendário de provas do segundo bimestre?", sender: "student", timestamp: "09:15", status: "Respondida" },
      { id: "question-2", text: "Bom dia! O calendário de provas será divulgado na próxima sexta-feira, dia 12/06. Você receberá uma notificação por e-mail e também poderá consultar no portal do aluno.", sender: "secretary", timestamp: "09:32" },
      { id: "question-3", text: "Perfeito! Muito obrigado pela resposta rápida.", sender: "student", timestamp: "09:35", status: "Concluída" },
      { id: "question-4", text: "Disponha! Estamos à disposição para ajudar. 😊", sender: "secretary", timestamp: "09:36" },
    ],
    reclamacoes: [
      { id: "complaint-1", text: "Gostaria de relatar que a internet da biblioteca está muito lenta nos últimos dias, o que tem dificultado o acesso aos materiais de pesquisa.", sender: "student", timestamp: "14:20", status: "Em análise" },
      { id: "complaint-2", text: "Obrigado pelo relato. Já encaminhamos sua solicitação para o setor de TI. Eles vão verificar o problema e fazer os ajustes necessários nos próximos dias.", sender: "secretary", timestamp: "14:45" },
      { id: "complaint-3", text: "Entendido. Quando houver uma solução, vocês podem me avisar?", sender: "student", timestamp: "14:50", status: "Respondida" },
    ],
    sugestoes: [
      { id: "idea-1", text: "Sugiro que a escola disponibilize mais opções vegetarianas e veganas na cantina. Muitos alunos têm essas preferências alimentares.", sender: "student", timestamp: "11:00", status: "Em análise" },
      { id: "idea-2", text: "Que ótima sugestão! Vamos encaminhar para a coordenação pedagógica e a empresa responsável pela cantina. Agradecemos pelo feedback construtivo!", sender: "secretary", timestamp: "11:25" },
    ],
  },
};

const state = {
  data: null,
  student: null,
  conversations: {},
  currentCategory: "perguntas",
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
};

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  state.data = clone(FALLBACK_DATA);
  state.conversations = clone(state.data.conversations);
  state.currentCategory = state.data.categories[0]?.id || "perguntas";
  bindEvents();
  const user = await getCurrentUser();
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

  elements.mobileMenuButton.addEventListener("click", () => {
    toggleMobileMenu(!elements.sidebar.classList.contains("is-open"));
  });
  elements.sidebarOverlay.addEventListener("click", () => toggleMobileMenu(false));

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) toggleMobileMenu(false);
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
  clearErrors(elements.loginForm);

  const identity = valueOf("loginIdentity");
  const password = valueOf("loginPassword");
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
    setFormBusy(elements.loginForm, false);
  }
}

async function handleRegistration(event) {
  event.preventDefault();
  clearErrors(elements.registerForm);

  const fields = {
    name: valueOf("registerName"),
    ra: valueOf("registerRa"),
    classroom: valueOf("registerClass"),
    email: valueOf("registerEmail"),
    password: valueOf("registerPassword"),
    confirmPassword: valueOf("registerConfirmPassword"),
  };
  let hasError = false;

  if (!fields.name) hasError = setError("registerName", "Informe seu nome completo.") || hasError;
  if (!fields.ra) hasError = setError("registerRa", "Informe seu RA.") || hasError;
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
  showPortal();
}

function showPortal() {
  elements.authScreen.hidden = true;
  elements.portalScreen.hidden = false;
  renderProfile();
  renderNavigation();
  renderConversation();
  requestAnimationFrame(() => elements.messageInput.focus());
}

function showLogin() {
  elements.portalScreen.hidden = true;
  elements.authScreen.hidden = false;
}

function renderNavigation() {
  elements.categoryNav.replaceChildren();

  state.data.categories.forEach((category) => {
    const button = document.createElement("button");
    const isActive = category.id === state.currentCategory;
    button.type = "button";
    button.className = `category-button${isActive ? " is-active" : ""}`;
    button.setAttribute("aria-current", isActive ? "page" : "false");
    button.dataset.category = category.id;
    button.innerHTML = `${categoryIcon(category.icon)}<span>${escapeHtml(category.label)}</span>`;
    button.addEventListener("click", () => setCategory(category.id));
    elements.categoryNav.append(button);
  });
}

function setCategory(categoryId) {
  if (!Object.hasOwn(state.conversations, categoryId)) return;
  state.currentCategory = categoryId;
  renderNavigation();
  renderConversation();
  toggleMobileMenu(false);
}

function renderProfile() {
  elements.studentName.textContent = state.student.name;
  elements.studentClass.textContent = state.student.classroom;
  elements.studentAvatar.textContent = initials(state.student.name);
}

function renderConversation() {
  const category = state.data.categories.find((item) => item.id === state.currentCategory);
  const messages = state.conversations[state.currentCategory] || [];

  elements.categoryTitle.textContent = category?.label || "Conversa";
  elements.messageList.replaceChildren();

  if (!messages.length) {
    elements.messageList.append(createEmptyState());
    return;
  }

  const fragment = document.createDocumentFragment();
  messages.forEach((message) => fragment.append(createMessage(message)));
  elements.messageList.append(fragment);
  requestAnimationFrame(() => {
    elements.messageList.scrollTop = elements.messageList.scrollHeight;
  });
}

function createMessage(message) {
  const isStudent = message.sender === "student";
  const row = document.createElement("article");
  row.className = `message-row message-row--${isStudent ? "student" : "secretary"}`;

  const group = document.createElement("div");
  group.className = "message-group";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = message.text;
  group.append(bubble);

  const meta = document.createElement("div");
  meta.className = "message-meta";

  if (message.status) {
    const status = document.createElement("span");
    status.className = `message-status ${statusClass(message.status)}`;
    status.textContent = message.status;
    meta.append(status);
  }

  const time = document.createElement("time");
  time.textContent = message.timestamp;
  meta.append(time);

  group.append(meta);
  row.append(group);
  return row;
}

function createEmptyState() {
  const stateElement = document.createElement("div");
  stateElement.className = "empty-state";
  stateElement.innerHTML = `
    <div>
      <div class="empty-state__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><path d="m21 3-7.25 18-3.4-7.35L3 10.25 21 3Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <h3>Nenhuma mensagem ainda</h3>
      <p>Inicie uma conversa com a secretaria.</p>
    </div>`;
  return stateElement;
}

function handleMessageSubmit(event) {
  event.preventDefault();
  const text = elements.messageInput.value.trim();
  if (!text) return;

  const message = {
    id: `student-${Date.now()}`,
    text,
    sender: "student",
    timestamp: new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date()),
    status: "Em análise",
  };

  state.conversations[state.currentCategory].push(message);
  elements.messageInput.value = "";
  updateSendButton();
  renderConversation();
  elements.messageInput.focus();
}

function updateSendButton() {
  elements.sendButton.disabled = !elements.messageInput.value.trim();
}

function togglePassword(button) {
  const input = document.getElementById(button.dataset.passwordToggle);
  if (!input) return;

  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  button.setAttribute("aria-label", isHidden ? "Ocultar senha" : "Mostrar senha");
}

function toggleMobileMenu(open) {
  elements.sidebar.classList.toggle("is-open", open);
  elements.sidebarOverlay.classList.toggle("is-open", open);
  elements.mobileMenuButton.setAttribute("aria-expanded", String(open));
  document.body.style.overflow = open ? "hidden" : "";
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

function statusClass(status) {
  const statusMap = {
    Respondida: "status--respondida",
    Concluída: "status--concluida",
    "Em análise": "status--em-analise",
  };
  return statusMap[status] || "";
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function getCurrentUser() {
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
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
  try {
    response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Não foi possível conectar ao servidor.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
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
  form.querySelectorAll("input, button").forEach((element) => {
    element.disabled = busy;
  });
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
