-- MySQL 8.4+/9.7, InnoDB. DATETIME values are UTC; UI displays America/Sao_Paulo.
-- DDL commits implicitly. No DROP, TRUNCATE or seed/private data in this file.
CREATE DATABASE IF NOT EXISTS connectclass CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;
USE connectclass;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  ra VARCHAR(40) NULL,
  email VARCHAR(254) NOT NULL,
  senha_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  tipo VARCHAR(10) NOT NULL,
  turma VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT uq_users_ra UNIQUE (ra),
  CONSTRAINT uq_users_role UNIQUE (id, tipo),
  CONSTRAINT ck_users_role CHECK (tipo IN ('aluno', 'gestor')),
  CONSTRAINT ck_users_student CHECK (tipo <> 'aluno' OR (ra IS NOT NULL AND turma IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;

-- One conversation is ONE atendimento, not the aluno+categoria UI group.
CREATE TABLE IF NOT EXISTS conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  categoria VARCHAR(20) COLLATE utf8mb4_0900_bin NOT NULL,
  status VARCHAR(20) COLLATE utf8mb4_0900_bin NOT NULL DEFAULT 'Pendente',
  nome_aluno_snapshot VARCHAR(120) NULL,
  ra_snapshot VARCHAR(40) NULL,
  turma_snapshot VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  last_activity_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_conversations_student_category (usuario_id, categoria, created_at),
  KEY ix_conversations_status_created (status, created_at),
  KEY ix_conversations_category_created (categoria, created_at),
  KEY ix_conversations_activity (last_activity_at DESC, id),
  CONSTRAINT fk_conversations_student FOREIGN KEY (usuario_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT ck_conversations_category CHECK (categoria IN ('Pergunta', 'Reclamação', 'Sugestão')),
  CONSTRAINT ck_conversations_status CHECK (status IN ('Pendente', 'Respondida', 'Resolvida', 'Em análise'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  sender_type VARCHAR(10) NOT NULL,
  sender_name_snapshot VARCHAR(120) NULL,
  content TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  legacy_reply_id BIGINT UNSIGNED NULL,
  root_conversation_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN sender_type = 'aluno' THEN conversation_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  CONSTRAINT uq_messages_root UNIQUE (root_conversation_id),
  CONSTRAINT uq_messages_legacy_reply UNIQUE (legacy_reply_id),
  KEY ix_messages_conversation_created (conversation_id, created_at, id),
  KEY ix_messages_sender (sender_id, sender_type),
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE RESTRICT,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id, sender_type) REFERENCES users (id, tipo) ON DELETE RESTRICT,
  CONSTRAINT ck_messages_role CHECK (sender_type IN ('aluno', 'gestor')),
  CONSTRAINT ck_messages_content CHECK (CHAR_LENGTH(content) BETWEEN 1 AND 1000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;

CREATE TABLE IF NOT EXISTS import_batches (
  fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  users_count BIGINT UNSIGNED NOT NULL,
  conversations_count BIGINT UNSIGNED NOT NULL,
  replies_count BIGINT UNSIGNED NOT NULL,
  imported_at DATETIME(3) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INT NOT NULL PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL
) ENGINE=InnoDB;
INSERT IGNORE INTO schema_migrations (version, applied_at) VALUES (1, UTC_TIMESTAMP(3));
