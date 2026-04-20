# 🚀 E-Flow System: Advanced Document Workflow & Approval Platform

**E-Flow System** is a comprehensive, secure, and dynamic web application designed to digitize, automate, and govern document workflows within an educational or corporate institution. It eliminates the friction of physical paperwork by providing a smart routing engine, secure digital signatures, and rigorous role-based access control.

---

## ✨ Impressive Features & Technical Highlights

This project goes beyond a standard CRUD application. It implements enterprise-grade features focusing on security, data integrity, and complex state management:

### 1. 🛡️ Cryptographically Secure Digital Signatures
- **HMAC Hash Chaining:** Every signature and approval step is cryptographically linked using HMAC hashing. This guarantees document integrity—any unauthorized modification to the document or the approval chain is instantly detectable.
- **OTP Verification via Brevo SMTP:** Before signing, users must authenticate via a One-Time Password (OTP) sent to their registered email.
- **Canvas Signature Capture:** Integrates a seamless UI for capturing hand-drawn signatures, which are locked after registration with a visual confirmation preview.

### 2. 🔀 Advanced Workflow Routing Engine
The heart of E-Flow is its dynamic Workflow Builder, which allows administrators to visually construct complex document paths.
- **Conditional Routing:** Workflows can automatically branch based on document tags or staff decisions.
- **Document Chaining & Spawn on Approval:** Approving one document can automatically trigger (spawn) the next required workflow, chaining processes together seamlessly.
- **Graduation Clearance Node:** Specialized logic nodes designed for complex, multi-departmental approvals like student graduation clearances.

### 3. 🔐 Granular Role-Based Access Control (RBAC)
- **Per-Node Permissions:** Administrators configure exactly what actions (Approve, Reject, Attach) are allowed at each specific node in the workflow.
- **Strict Document Governance:** The system enforces a strict PDF-only policy with a 10MB file size limit to ensure standardization and security across all uploads.
- **Dynamic Dashboard:** Staff and students see customized dashboards that only show actions and data relevant to their specific permissions and current tasks.

## 4. 👥 Bulk User Onboarding & "Magic Link" Authentication
- **CSV Data Ingestion:** Administrators can upload CSV files to provision hundreds of users instantly. The backend strictly validates the parsed data.
- **Magic Links:** Newly imported users receive a secure "Magic Link" via email to reset their passwords and activate their accounts without manual administrative overhead.

---

## 🛠️ Technology Stack

**Frontend:**
- **React.js** for building a dynamic, interactive user interface.
- **Vanilla CSS** with a focus on modern, vibrant aesthetics and micro-animations.
- **react-signature-canvas** for seamless digital signature capture.

**Backend:**
- **Node.js & Express.js** for robust API development.
- **PostgreSQL (`pg`)** for reliable relational data management.
- **multer** for secure file handling and storage.
- **pdf-lib & pdf-parse** for advanced PDF document processing.
- **bcrypt & jsonwebtoken** for strict authentication and session management.
- **nodemailer (Brevo SMTP)** for delivering critical OTPs and Magic Links.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- PostgreSQL database

### Installation

1. **Clone the repository and install dependencies:**

   **Backend:**
   ```bash
   cd server
   npm install
   ```

   **Frontend:**
   ```bash
   cd client
   npm install
   ```

2. **Environment Configuration:**
   - Create a `.env` file in the `server` directory.
   - Configure your database connection string, JWT secret, and Brevo SMTP credentials.

3. **Run the Application:**
   
   **Start the Backend:**
   ```bash
   cd server
   npm run dev
   ```

   **Start the Frontend:**
   ```bash
   cd client
   npm start
   ```

---

## 🧪 Testing Accounts

You can use the following pre-configured accounts to test different roles within the system:

| Role | Email | Password |
| :--- | :--- | :--- |
| **Admin** | `admin@example.com` | `123` |
| **Staff** | `staff@example.com` | `123` |
| **Staff 2** | `staff2@example.com` | `123` |
| **Student** | `abebe@example.com` | `123` |

