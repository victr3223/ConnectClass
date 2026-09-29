"use strict";

// Shared text-only rendering for both sides of an attendance conversation.
window.ConnectClassUI = (() => {
  const formatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

  function formatDateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Data indisponível" : formatter.format(date);
  }

  function statusClass(status) {
    const classes = { Pendente: "status--pendente", Respondida: "status--respondida", Resolvida: "status--resolvida", "Em análise": "status--em-analise" };
    return Object.hasOwn(classes, status) ? classes[status] : "";
  }

  function createTimeline(messages) {
    const entries = messages.flatMap((message) => [
      { ...message, sender: "student", parentId: message.id },
      ...(message.respostas || []).map((reply) => ({ ...reply, sender: "secretary", parentId: message.id })),
    ]).sort((left, right) => Date.parse(left.dataHora) - Date.parse(right.dataHora));
    const fragment = document.createDocumentFragment();
    entries.forEach((entry) => {
      const row = document.createElement("article");
      row.className = `message-row message-row--${entry.sender}`;
      row.dataset.messageId = entry.parentId;
      const group = document.createElement("div");
      group.className = "message-group";
      const sender = document.createElement("span");
      sender.className = "message-sender";
      sender.textContent = entry.sender === "secretary" ? `Secretaria · resposta ao atendimento #${entry.parentId}` : `Atendimento #${entry.parentId}`;
      const bubble = document.createElement("div");
      bubble.className = "message-bubble";
      bubble.textContent = entry.mensagem;
      const meta = document.createElement("div");
      meta.className = "message-meta";
      if (entry.sender === "student" && entry.status) {
        const status = document.createElement("span");
        status.className = `message-status ${statusClass(entry.status)}`;
        status.textContent = entry.status;
        meta.append(status);
      }
      const time = document.createElement("time");
      time.dateTime = entry.dataHora;
      time.textContent = formatDateTime(entry.dataHora);
      meta.append(time);
      group.append(sender, bubble, meta);
      row.append(group);
      fragment.append(row);
    });
    return fragment;
  }

  return Object.freeze({ createTimeline, statusClass, formatDateTime });
})();
