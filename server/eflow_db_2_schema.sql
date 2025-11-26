-- ============================================================
-- eflow_db_2 — Full Schema
-- Includes all original tables PLUS pitfall-fix columns:
--   Pitfall 2: dynamic_roles.sealed_at, sealed_by, is_active default TRUE
--   Pitfall 3: documents.original_sla_deadline, delegation_sla_deadline
--   Pitfall 5: dynamic_roles.is_escalation_fallback
--   Pitfall 6: audit_logs.role_id
-- ============================================================

-- 1. DEPARTMENTS
CREATE TABLE departments (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

-- 2. DYNAMIC ROLES  (Pitfall 2 & 5 columns added)
CREATE TABLE dynamic_roles (
    id                         SERIAL PRIMARY KEY,
    name                       VARCHAR(100) UNIQUE NOT NULL,
    department_id              INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    can_create_workflows       BOOLEAN DEFAULT FALSE,
    requires_workflow_approval BOOLEAN DEFAULT FALSE,
    can_manage_users           BOOLEAN DEFAULT FALSE,
    -- Pitfall 2: Role Sealing
    is_active                  BOOLEAN DEFAULT TRUE NOT NULL,
    sealed_at                  TIMESTAMPTZ,
    sealed_by                  INTEGER,            -- FK added after users table is created
    -- Pitfall 5: Designated Fallback
    is_escalation_fallback     BOOLEAN DEFAULT FALSE NOT NULL
);

-- 3. USERS
CREATE TABLE users (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(100) NOT NULL,
    email            VARCHAR(150) UNIQUE NOT NULL,
    password_hash    VARCHAR(255) NOT NULL,
    role_id          INTEGER DEFAULT 1,            -- 1=Staff, 2=Staff+, 3=SuperAdmin (legacy)
    department_id    INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    supervisor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_out_of_office BOOLEAN DEFAULT FALSE,
    delegate_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Now that users exists, add the FK for sealed_by
ALTER TABLE dynamic_roles
    ADD CONSTRAINT fk_sealed_by FOREIGN KEY (sealed_by) REFERENCES users(id) ON DELETE SET NULL;

-- 4. WORKFLOWS
CREATE TABLE workflows (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(150) NOT NULL,
    flow_structure JSONB,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 5. DOCUMENTS  (Pitfall 3 columns added)
CREATE TABLE documents (
    id                      SERIAL PRIMARY KEY,
    title                   VARCHAR(255) NOT NULL,
    file_path               VARCHAR(500),
    extracted_text          TEXT,
    submitter_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    workflow_id             INTEGER REFERENCES workflows(id) ON DELETE SET NULL,
    current_node_id         VARCHAR(100),
    current_assignee_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    metadata_tag            VARCHAR(100),
    status                  VARCHAR(50) DEFAULT 'Pending',
    -- Pitfall 3: Dual SLA clocks
    original_sla_deadline   TIMESTAMPTZ,           -- Frozen at first assignment, never updated
    delegation_sla_deadline TIMESTAMPTZ,           -- Reset each time document is escalated/re-routed
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- 6. APPROVALS
CREATE TABLE approvals (
    id           SERIAL PRIMARY KEY,
    document_id  INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    approver_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    node_id      VARCHAR(100),
    status       VARCHAR(50),
    comments     TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 7. AUDIT LOGS  (Pitfall 6: role_id FK)
CREATE TABLE audit_logs (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
    -- Pitfall 6: Store role ID, never role name string
    role_id     INTEGER REFERENCES dynamic_roles(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    timestamp   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Seed Data: Legacy roles + a default Super Admin user
-- ============================================================

-- Insert a default Super Admin so the system is usable immediately
-- Password: "admin123" (bcrypt hash — change in production!)
INSERT INTO users (name, email, password_hash, role_id)
VALUES (
    'Super Admin',
    'admin@eflow.edu',
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- "password" hashed
    3
);

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX idx_documents_status          ON documents(status);
CREATE INDEX idx_documents_assignee        ON documents(current_assignee_id);
CREATE INDEX idx_audit_logs_user           ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_role           ON audit_logs(role_id);
CREATE INDEX idx_dynamic_roles_is_active   ON dynamic_roles(is_active);
CREATE INDEX idx_dynamic_roles_fallback    ON dynamic_roles(is_escalation_fallback);
