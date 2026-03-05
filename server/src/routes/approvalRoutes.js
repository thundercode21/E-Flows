const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const authenticateToken = require('../middleware/authMiddleware');

// The Stamping Libraries
const { PDFDocument, rgb, degrees } = require('pdf-lib');
const sharp = require('sharp');
const fs = require('fs');

const pool = new Pool({
    user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_NAME, password: process.env.DB_PASSWORD, port: process.env.DB_PORT,
});

const otpStore = new Map();

// ── In-App Notification Helper ───────────────────────────────────────────────
const insertNotification = async (userId, title, body, type = 'info', documentId = null) => {
    if (!userId) return;
    try {
        await pool.query(
            'INSERT INTO notifications (user_id, title, body, type, document_id) VALUES ($1, $2, $3, $4, $5)',
            [userId, title, body, type, documentId]
        );
    } catch (err) {
        console.error('Failed to insert notification:', err.message);
    }
};

// Mailer Configuration
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: process.env.SMTP_PORT == 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: { ciphers: 'SSLv3' }
});

// Verify SMTP connection on startup — surfaces auth/config errors immediately
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ SMTP CONNECTION FAILED:', error);
    } else {
        console.log('✅ SMTP Server ready — emails will be delivered');
    }
});

// Universal Email Helper
const sendNotificationEmail = async (userId, subject, message) => {
    try {
        const userQuery = await pool.query('SELECT email, name, email_notifications FROM users WHERE id = $1', [userId]);
        if (userQuery.rows.length > 0) {
            const { email, name, email_notifications } = userQuery.rows[0];
            
            if (email_notifications === false) {
                console.log(`\n🚫 NOTIFICATION SKIPPED FOR ${email} (Notifications disabled by user)`);
                return;
            }

            console.log(`\n📧 SENDING EMAIL TO: ${email} | SUBJECT: ${subject}`);
            const info = await transporter.sendMail({
                from: `"E-flow System" <${process.env.FROM_EMAIL}>`,
                to: email,
                subject: subject,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px; max-width: 500px;">
                        <h2 style="color: #4f46e5;">E-flow Notification</h2>
                        <p>Hello ${name},</p>
                        <p style="font-size: 16px; color: #374151;">${message}</p>
                        <hr style="border: none; border-top: 1px solid #eaeaea; margin: 20px 0;" />
                        <p style="font-size: 12px; color: #9ca3af;">Please log in to your dashboard to view the details.</p>
                    </div>
                `
            });
            console.log(`✅ EMAIL SENT SUCCESSFULLY — MessageId: ${info.messageId}`);
        }
    } catch (err) {
        console.error(`❌ EMAIL SEND FAILED — Subject: "${subject}" | Error: ${err.message}`);
    }
};


// ── Helper: Append Signature Certificate page to approved PDFs ──────────────
// PDF-only since all uploads are now PDF.
const appendSignatureCertificate = async (filePath, documentId, documentTitle, pool) => {
    try {
        if (!filePath) return false;
        const lowerPath = filePath.toLowerCase();

        // Only handle PDFs — file uploads are PDF-only
        if (!lowerPath.endsWith('.pdf')) return false;

        console.log(`\n📄 APPENDING SIGNATURE CERTIFICATE to: ${filePath}`);

        // Fetch all approvals for this document
        const approvalsQuery = await pool.query(
            `SELECT a.*, u.name as approver_name 
             FROM approvals a 
             JOIN users u ON a.approver_id = u.id 
             WHERE a.document_id = $1 AND a.status = 'Approved'
             ORDER BY a.id ASC`,
            [documentId]
        );
        const approvals = approvalsQuery.rows;

        const existingPdfBytes = fs.readFileSync(filePath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);

        // ── Add the Certificate Page ──────────────────────────────────────────
        const certPage = pdfDoc.addPage([595.28, 841.89]); // A4
        const { width: cw, height: ch } = certPage.getSize();
        const margin = 50;
        let y = ch - margin;

        // Header background strip
        certPage.drawRectangle({ x: 0, y: ch - 90, width: cw, height: 90, color: rgb(0.31, 0.27, 0.9), opacity: 0.9 });

        // Title
        certPage.drawText('APPROVAL CERTIFICATE', {
            x: margin, y: ch - 58, size: 22, color: rgb(1, 1, 1),
        });
        certPage.drawText('E-Flow Document Management System', {
            x: margin, y: ch - 78, size: 11, color: rgb(0.85, 0.85, 1),
        });

        y = ch - 120;

        // Document info block
        certPage.drawText('Document:', { x: margin, y, size: 10, color: rgb(0.45, 0.45, 0.45) });
        certPage.drawText(documentTitle || 'Untitled', { x: margin + 80, y, size: 10, color: rgb(0.1, 0.1, 0.1) });
        y -= 18;
        certPage.drawText('Generated:', { x: margin, y, size: 10, color: rgb(0.45, 0.45, 0.45) });
        certPage.drawText(new Date().toLocaleString(), { x: margin + 80, y, size: 10, color: rgb(0.1, 0.1, 0.1) });
        y -= 18;
        certPage.drawText('Document ID:', { x: margin, y, size: 10, color: rgb(0.45, 0.45, 0.45) });
        certPage.drawText(String(documentId), { x: margin + 80, y, size: 10, color: rgb(0.1, 0.1, 0.1) });
        y -= 30;

        // Divider line
        certPage.drawLine({ start: { x: margin, y }, end: { x: cw - margin, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
        y -= 25;

        certPage.drawText('APPROVAL CHAIN', { x: margin, y, size: 12, color: rgb(0.31, 0.27, 0.9) });
        y -= 20;

        // Per-approver blocks
        for (let i = 0; i < approvals.length; i++) {
            const app = approvals[i];
            const blockHeight = app.signature_drawing ? 140 : 85;

            if (y - blockHeight < margin) {
                // Not enough space — add another page
                const extraPage = pdfDoc.addPage([595.28, 841.89]);
                y = extraPage.getSize().height - margin;
                // Draw on extraPage instead — for simplicity we'll just break
                break;
            }

            // Approver card background
            certPage.drawRectangle({
                x: margin, y: y - blockHeight + 10, width: cw - 2 * margin, height: blockHeight,
                color: rgb(0.97, 0.97, 1), borderColor: rgb(0.8, 0.8, 0.9), borderWidth: 1,
            });

            // Step number badge
            certPage.drawRectangle({ x: margin + 10, y: y - 5, width: 24, height: 18, color: rgb(0.31, 0.27, 0.9) });
            certPage.drawText(String(i + 1), { x: margin + 17, y: y - 2, size: 11, color: rgb(1, 1, 1) });

            // Approver name + timestamp
            certPage.drawText(app.approver_name, { x: margin + 44, y: y - 2, size: 12, color: rgb(0.1, 0.1, 0.1) });
            certPage.drawText(`Approved: ${new Date(app.created_at).toLocaleString()}`, {
                x: margin + 44, y: y - 18, size: 9, color: rgb(0.45, 0.45, 0.45),
            });

            // HMAC signature hash (truncated)
            if (app.approval_signature) {
                const shortHash = app.approval_signature.substring(0, 40) + '...';
                certPage.drawText(`HMAC: ${shortHash}`, {
                    x: margin + 44, y: y - 32, size: 7.5, color: rgb(0.55, 0.55, 0.55),
                });
            }

            // Drawn signature image (if captured)
            if (app.signature_drawing) {
                try {
                    // Strip data URL prefix: "data:image/png;base64,..."
                    const base64Data = app.signature_drawing.replace(/^data:image\/png;base64,/, '');
                    const sigBuffer = Buffer.from(base64Data, 'base64');
                    const sigImage = await pdfDoc.embedPng(sigBuffer);
                    const sigDims = sigImage.scale(0.35);
                    certPage.drawImage(sigImage, {
                        x: margin + 44,
                        y: y - 50 - sigDims.height,
                        width: sigDims.width,
                        height: sigDims.height,
                        opacity: 0.9,
                    });
                    certPage.drawText('Drawn Signature:', {
                        x: margin + 44, y: y - 48, size: 8, color: rgb(0.45, 0.45, 0.45),
                    });
                } catch (sigErr) {
                    console.error('Failed to embed signature image:', sigErr.message);
                }
            }

            y -= blockHeight + 12;
        }

        // Footer
        const footerY = margin;
        certPage.drawLine({ start: { x: margin, y: footerY + 18 }, end: { x: cw - margin, y: footerY + 18 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
        certPage.drawText('This certificate was generated automatically by E-Flow. The cryptographic HMAC signatures above provide tamper-evident proof of each approval.', {
            x: margin, y: footerY + 6, size: 7, color: rgb(0.6, 0.6, 0.6),
        });

        fs.writeFileSync(filePath, await pdfDoc.save());
        console.log('✅ Approval Certificate page appended successfully!');
        return true;

    } catch (err) {
        console.error('Failed to append certificate:', err);
        return false;
    }
};

// POST: Request OTP
router.post('/request-otp', authenticateToken, async (req, res) => {
    try {
        const { documentId } = req.body;
        
        const existingData = otpStore.get(req.user.id);
        if (existingData && existingData.documentId === documentId && existingData.generatedAt) {
            const timeSinceGenerated = Date.now() - existingData.generatedAt;
            if (timeSinceGenerated < 2 * 60 * 1000) {
                return res.status(429).json({ message: 'Please wait 2 minutes before requesting a new code.' });
            }
        }

        const otp = crypto.randomInt(100000, 999999).toString();
        otpStore.set(req.user.id, { otp, documentId, expires: Date.now() + 5 * 60000, generatedAt: Date.now() });

        const userQuery = await pool.query('SELECT email, name FROM users WHERE id = $1', [req.user.id]);
        const { email, name } = userQuery.rows[0];

        console.log(`\n🔑 DEV MODE - OTP GENERATED: ${otp}\n`);

        // Send the OTP via email
        try {
            await transporter.sendMail({
                from: `"E-flow System" <${process.env.FROM_EMAIL}>`,
                to: email,
                subject: 'Your E-flow Approval OTP',
                html: `<p>Hello ${name},</p>
                       <p>Your one-time approval code is: <b style="font-size:24px">${otp}</b></p>
                       <p>This code expires in 5 minutes.</p>`
            });
            res.status(200).json({ message: 'OTP sent to your email' });
        } catch (emailErr) {
            console.error('Email failed:', emailErr.message);
            if (process.env.NODE_ENV !== 'production') {
                return res.status(200).json({ message: 'Email failed (dev mode) — OTP: ' + otp });
            }
            throw emailErr;
        }
    } catch (err) {
        console.error('OTP error:', err);
        res.status(500).json({ message: 'Error generating OTP' });
    }
});

// POST: Approve & Route Document (Advanced Engine)
router.post('/approve', authenticateToken, async (req, res) => {
    const { documentId, otp, comments, signatureDrawing } = req.body;
    const storedData = otpStore.get(req.user.id);

    if (!storedData || storedData.otp !== otp || storedData.documentId !== documentId) {
        return res.status(400).json({ message: 'Invalid or incorrect OTP' });
    }
    if (Date.now() > storedData.expires) {
        otpStore.delete(req.user.id);
        return res.status(400).json({ message: 'OTP has expired' });
    }

    try {
        await pool.query('BEGIN');

        // Fetch doc details including file_path and extracted_text for inheritance!
        const docQuery = await pool.query(
            'SELECT title, submitter_id, workflow_id, current_node_id, metadata_tag, file_path, extracted_text, parallel_branch_data, current_assignee_id, current_role_id, current_department_id FROM documents WHERE id = $1',
            [documentId]
        );
        const doc = docQuery.rows[0];

        // ── AUTHORIZATION CHECK ────────────────────────────────────────────────
        const isSuperAdmin = req.user.role_id === 3;
        let isAuthorized = isSuperAdmin;
        
        if (!isSuperAdmin) {
            const isDirectAssignee = doc.current_assignee_id === req.user.id;
            const isRoleAssignee = !doc.current_assignee_id && doc.current_role_id === req.user.role_id && (!doc.current_department_id || doc.current_department_id === req.user.department_id);
            
            const existingBranches = doc.parallel_branch_data;
            let isParallelAssignee = false;
            if (existingBranches && Array.isArray(existingBranches)) {
                isParallelAssignee = existingBranches.some(b => {
                    if (b.status !== 'Pending') return false;
                    if (b.assigneeId === req.user.id) return true;
                    if (b.roleId === req.user.role_id && (!b.departmentId || b.departmentId === req.user.department_id)) return true;
                    return false;
                });
            }

            isAuthorized = isDirectAssignee || isRoleAssignee || isParallelAssignee;
        }

        if (!isAuthorized) {
            await pool.query('ROLLBACK');
            return res.status(403).json({ message: 'You are not authorized to approve this document at this stage.' });
        }
        // ── END AUTHORIZATION CHECK ────────────────────────────────────────────

        // FEATURE 2: Prerequisite check
        const prereqCheck = await pool.query(
            'SELECT id FROM document_prerequisites WHERE parent_document_id = $1 AND fulfilled_by_document_id IS NULL',
            [documentId]
        );
        if (prereqCheck.rows.length > 0) {
            return res.status(400).json({ message: `Cannot approve. Waiting for ${prereqCheck.rows.length} clearance document(s).` });
        }

        // Pre-fetch submitter info once — used by email nodes for template variables
        let submitterInfo = null;
        if (doc.submitter_id) {
            const submitterQuery = await pool.query('SELECT name, email FROM users WHERE id = $1', [doc.submitter_id]);
            if (submitterQuery.rows.length > 0) {
                submitterInfo = submitterQuery.rows[0];
            }
        }

        // Helper: resolve {{submitter_email}}, {{submitter_name}}, {{document_title}} in any string
        const resolveTemplate = (text) => {
            if (!text) return text;
            return text
                .replace(/\{\{submitter_email\}\}/gi, submitterInfo?.email || '')
                .replace(/\{\{submitter_name\}\}/gi, submitterInfo?.name || '')
                .replace(/\{\{document_title\}\}/gi, doc.title || '');
        };

        // Helper: Execute Email Node
        const executeEmailNode = async (tNode) => {
            const recipientRaw = tNode.data?.recipient || '';
            const resolvedRecipient = resolveTemplate(recipientRaw);
            const resolvedSubject = resolveTemplate(tNode.data?.subject || 'E-flow Notification');
            const resolvedBody = resolveTemplate(tNode.data?.body || '');
            console.log(`\n📧 WORKFLOW EMAIL NODE — Sending to: ${resolvedRecipient} | Subject: ${resolvedSubject}`);
            try {
                if (resolvedRecipient) {
                    const info = await transporter.sendMail({
                        from: `"E-flow System" <${process.env.FROM_EMAIL}>`,
                        to: resolvedRecipient,
                        subject: resolvedSubject,
                        html: `
                            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px; max-width: 500px;">
                                <h2 style="color: #4f46e5;">E-flow Notification</h2>
                                <p style="font-size: 16px; color: #374151; white-space: pre-line;">${resolvedBody}</p>
                                <hr style="border: none; border-top: 1px solid #eaeaea; margin: 20px 0;" />
                                <p style="font-size: 12px; color: #9ca3af;">This is an automated message from the E-flow document system.</p>
                            </div>
                        `
                    });
                    console.log(`✅ WORKFLOW EMAIL SENT — MessageId: ${info.messageId}`);
                } else {
                    console.warn('⚠️ Workflow email node skipped — recipient address is empty');
                }
            } catch (emailErr) {
                console.error('❌ Workflow email node send FAILED:', emailErr);
            }
        };

        // Helper: Execute Spawn Node
        const executeSpawnNode = async (tNode) => {
            const spawnIds = tNode.data?.spawnIds;
            if (spawnIds) {
                const ids = spawnIds.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                for (const sId of ids) {
                    const wQuery = await pool.query('SELECT name, flow_structure FROM workflows WHERE id = $1', [sId]);
                    if (wQuery.rows.length > 0) {
                        const swf = typeof wQuery.rows[0].flow_structure === 'string' ? JSON.parse(wQuery.rows[0].flow_structure) : wQuery.rows[0].flow_structure;
                        const snodes = swf.nodes || [];
                        const sedges = swf.edges || [];
                        const start = snodes.find(n => !sedges.some(e => e.target === n.id)) || snodes[0];
                        
                        let initialAssigneeId = null;
                        let initialRoleId = null;
                        let initialDepartmentId = null;

                        if (start && start.type === 'task') {
                            if (start.data?.assignmentStrategy === 'role_based') {
                                let tRoleId = start.data.roleId ? parseInt(start.data.roleId, 10) : null;
                                let tDeptId = null;
                                if (start.data.routingType === 'SPECIFIC') {
                                    tDeptId = start.data.targetDepartmentId ? parseInt(start.data.targetDepartmentId, 10) : null;
                                } else if (start.data.routingType === 'INITIATOR_DEPT') {
                                    const submitterDeptQuery = await pool.query('SELECT department_id FROM users WHERE id = $1', [doc.submitter_id]);
                                    tDeptId = submitterDeptQuery.rows[0]?.department_id || null;
                                }

                                let lbQuery = `
                                    SELECT u.id, COUNT(d.id) as pending_count 
                                    FROM users u
                                    LEFT JOIN documents d ON d.current_assignee_id = u.id AND d.status = 'Pending'
                                    WHERE u.role_id = $1 AND u.is_active = true
                                `;
                                const lbParams = [tRoleId];
                                if (tDeptId) {
                                    lbQuery += ` AND u.department_id = $2`;
                                    lbParams.push(tDeptId);
                                }
                                lbQuery += ` GROUP BY u.id ORDER BY pending_count ASC LIMIT 1`;
                                
                                const lbResult = await pool.query(lbQuery, lbParams);
                                if (lbResult.rows.length > 0) {
                                    initialAssigneeId = lbResult.rows[0].id;
                                    initialRoleId = null;
                                    initialDepartmentId = null;
                                } else {
                                    initialRoleId = tRoleId;
                                    initialDepartmentId = tDeptId;
                                }
                            } else {
                                initialAssigneeId = start.data?.assignee ? parseInt(start.data.assignee, 10) : null;
                            }
                        }

                        await pool.query(
                            `INSERT INTO documents (title, submitter_id, workflow_id, current_node_id, current_assignee_id, current_role_id, current_department_id, status, file_path, extracted_text) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending', $8, $9)`,
                            [`Spawned: ${wQuery.rows[0].name}`, doc.submitter_id, sId, start?.id, initialAssigneeId, initialRoleId, initialDepartmentId, doc.file_path, doc.extracted_text]
                        );
                    }
                }
            }
        };

        let nextNodeId = null;
        let nextAssigneeId = null;
        let nextRoleId = null;
        let nextDepartmentId = null;
        let isFinalStep = true;
        let parallelBranches = null; // array of {nodeId, assigneeId, status} when in parallel mode

        // ── PARALLEL BRANCH CHECK ──────────────────────────────────────────────
        // If this document is currently inside a parallel gate (has branch data),
        // mark the current approver's branch as done instead of advancing linearly.
        const existingBranches = doc.parallel_branch_data;
        if (existingBranches && Array.isArray(existingBranches)) {
            // Find the branch this approver belongs to (by exact match OR role/dept match)
            const myBranchIdx = existingBranches.findIndex(b => {
                if (b.status !== 'Pending') return false;
                if (b.assigneeId === req.user.id) return true; // Direct assignment match
                // Role-based match
                if (b.roleId === req.user.role_id) {
                    if (!b.departmentId) return true; // ANY routing
                    if (b.departmentId === req.user.department_id) return true; // SPECIFIC or INITIATOR match
                }
                return false;
            });

            if (myBranchIdx !== -1) {
                existingBranches[myBranchIdx].status = 'Approved';
                const allDone = existingBranches.every(b => b.status === 'Approved');

                if (!allDone) {
                    // Other branches still pending — just update the branch data and exit
                    await pool.query(
                        'UPDATE documents SET parallel_branch_data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                        [JSON.stringify(existingBranches), documentId]
                    );
                    const SIGNING_SECRET = process.env.APPROVAL_SIGNING_SECRET || 'default_secret';
                    const docBuffer = fs.readFileSync(doc.file_path);
                    const documentHash = crypto.createHash('sha256').update(docBuffer).digest('hex');
                    
                    const prevApproval = await pool.query(
                        'SELECT id, approval_signature, document_hash, approver_id, created_at FROM approvals WHERE document_id = $1 ORDER BY id DESC LIMIT 1',
                        [documentId]
                    );
                    const prev = prevApproval.rows[0];
                    
                    const approvalDate = new Date();
                    const dataToSign = `${documentHash}|${req.user.id}|${approvalDate.toISOString()}`;
                    const approvalSignature = crypto.createHmac('sha256', SIGNING_SECRET).update(dataToSign).digest('hex');
                    
                    let previousApprovalHash = null;
                    if (prev) {
                        const prevData = `${prev.document_hash}|${prev.approver_id}|${prev.approval_signature}`;
                        previousApprovalHash = crypto.createHash('sha256').update(prevData).digest('hex');
                    }

                    await pool.query(
                        "INSERT INTO approvals (document_id, approver_id, node_id, status, comments, document_hash, approval_signature, previous_approval_id, previous_approval_hash, created_at, signature_drawing) VALUES ($1, $2, $3, 'Approved', $4, $5, $6, $7, $8, $9, $10)",
                        [documentId, req.user.id, doc.current_node_id || 'parallel', comments || 'Verified by 2FA', documentHash, approvalSignature, prev?.id || null, previousApprovalHash, approvalDate, signatureDrawing || null]
                    );
                    await pool.query(
                        "INSERT INTO audit_logs (document_id, user_id, action) VALUES ($1, $2, 'Parallel Branch Approved — Awaiting Other Reviewers')",
                        [documentId, req.user.id]
                    );
                    // Track which user IDs have completed their branch, so the frontend can hide it from their task list
                    if (!existingBranches.completedBy) existingBranches.completedBy = [];
                    if (!existingBranches.completedBy.includes(req.user.id)) {
                        existingBranches.completedBy.push(req.user.id);
                    }

                    await pool.query(
                        'UPDATE documents SET parallel_branch_data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                        [JSON.stringify(existingBranches), documentId]
                    );
                    await pool.query('COMMIT');
                    otpStore.delete(req.user.id);
                    return res.status(200).json({ message: 'Your branch approved — waiting for other reviewers to complete their branches.' });
                }

                // All branches done — clear parallel data and proceed past the parallel gate
                await pool.query(
                    'UPDATE documents SET parallel_branch_data = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [documentId]
                );
                // Override current_node_id to one of the completed branch task nodes 
                // so the walker traces its outgoing edge to find the NEXT step in the workflow.
                doc.current_node_id = existingBranches[0].nodeId;
                doc.parallel_branch_data = null;
            }
        }
        // ── END PARALLEL BRANCH CHECK ──────────────────────────────────────────

        if (doc.workflow_id && doc.current_node_id) {
            const wfQuery = await pool.query('SELECT flow_structure FROM workflows WHERE id = $1', [doc.workflow_id]);
            const flowData = typeof wfQuery.rows[0].flow_structure === 'string'
                ? JSON.parse(wfQuery.rows[0].flow_structure)
                : wfQuery.rows[0].flow_structure;

            const edges = flowData.edges || [];
            const nodes = flowData.nodes || [];

            let currentId = doc.current_node_id;

            while (true) {
                let outgoingEdges = edges.filter(e => e.source === currentId);
                if (outgoingEdges.length === 0) break; // End of graph — fully approved

                let edgeToFollow = outgoingEdges[0];

                const currentNodeObj = nodes.find(n => n.id === currentId);

                // Handle condition node: pick TRUE or FALSE branch based on metadata_tag
                if (currentNodeObj && currentNodeObj.type === 'condition') {
                    const docTag = (doc.metadata_tag || '').toLowerCase().trim();
                    const condValue = (currentNodeObj.data?.conditionValue || '').toLowerCase().trim();
                    const isMatch = docTag === condValue;
                    const expectedHandle = isMatch ? 'true' : 'false';
                    edgeToFollow = outgoingEdges.find(e => e.sourceHandle === expectedHandle);
                    if (!edgeToFollow) break;
                }

                let targetNode = nodes.find(n => n.id === edgeToFollow.target);
                if (!targetNode) break;

                if (targetNode.type === 'condition') {
                    // Condition nodes are transparent — continue looping from here
                    currentId = targetNode.id;

                } else if (targetNode.type === 'email') {
                    // ✅ EMAIL NODE: Execute inline — send an actual email, then continue walking
                    await executeEmailNode(targetNode);
                    // Continue walking from this email node to find the next real step
                    currentId = targetNode.id;

                } else if (targetNode.type === 'spawn') {
                    // FEATURE 3: Spawn on approval
                    await executeSpawnNode(targetNode);
                    currentId = targetNode.id;

                } else if (targetNode.type === 'delay') {
                    // Delay nodes: for now, treat as transparent (no actual scheduling yet)
                    currentId = targetNode.id;

                } else if (targetNode.type === 'parallel') {
                    // ✅ PARALLEL NODE: Fan out to ALL connected branches simultaneously
                    const parallelOutgoing = edges.filter(e => e.source === targetNode.id);
                    const branches = [];
                    for (const pe of parallelOutgoing) {
                        let branchNode = nodes.find(n => n.id === pe.target);
                        
                        // Trace through any transparent side-effect nodes on this single parallel branch
                        while (branchNode && branchNode.type !== 'task') {
                            if (branchNode.type === 'email') await executeEmailNode(branchNode);
                            else if (branchNode.type === 'spawn') await executeSpawnNode(branchNode);
                            
                            const nextEdge = edges.find(e => e.source === branchNode.id);
                            if (nextEdge) branchNode = nodes.find(n => n.id === nextEdge.target);
                            else { branchNode = null; break; }
                        }

                        if (branchNode && branchNode.type === 'task') {
                            let bAssigneeId = null;
                            let bRoleId = null;
                            let bDepartmentId = null;

                            if (branchNode.data?.assignmentStrategy === 'role_based') {
                                let tRoleId = branchNode.data.roleId ? parseInt(branchNode.data.roleId, 10) : null;
                                let tDeptId = null;
                                if (branchNode.data.routingType === 'SPECIFIC') {
                                    tDeptId = branchNode.data.targetDepartmentId ? parseInt(branchNode.data.targetDepartmentId, 10) : null;
                                } else if (branchNode.data.routingType === 'INITIATOR_DEPT' && doc.submitter_id) {
                                    const sQuery = await pool.query('SELECT department_id FROM users WHERE id = $1', [doc.submitter_id]);
                                    tDeptId = sQuery.rows[0]?.department_id || null;
                                }

                                let lbQuery = `
                                    SELECT u.id, COUNT(d.id) as pending_count 
                                    FROM users u
                                    LEFT JOIN documents d ON d.current_assignee_id = u.id AND d.status = 'Pending'
                                    WHERE u.role_id = $1 AND u.is_active = true
                                `;
                                const lbParams = [tRoleId];
                                if (tDeptId) {
                                    lbQuery += ` AND u.department_id = $2`;
                                    lbParams.push(tDeptId);
                                }
                                lbQuery += ` GROUP BY u.id ORDER BY pending_count ASC LIMIT 1`;
                                
                                const lbResult = await pool.query(lbQuery, lbParams);
                                if (lbResult.rows.length > 0) {
                                    bAssigneeId = lbResult.rows[0].id;
                                    bRoleId = null;
                                    bDepartmentId = null;
                                } else {
                                    bRoleId = tRoleId;
                                    bDepartmentId = tDeptId;
                                }
                            } else {
                                bAssigneeId = branchNode.data?.assignee ? parseInt(branchNode.data.assignee, 10) : null;
                            }

                            branches.push({
                                parallelNodeId: targetNode.id,
                                nodeId: branchNode.id,
                                assigneeId: bAssigneeId,
                                roleId: bRoleId,
                                departmentId: bDepartmentId,
                                status: 'Pending'
                            });
                        }
                    }
                    if (branches.length > 0) {
                        parallelBranches = branches;
                        isFinalStep = false;
                    }
                    break;

                } else {
                    // It's a task (approval) node — this is the next human step
                    nextNodeId = targetNode.id;
                    if (targetNode.data?.assignmentStrategy === 'role_based') {
                        let tRoleId = targetNode.data.roleId ? parseInt(targetNode.data.roleId, 10) : null;
                        let tDeptId = null;
                        if (targetNode.data.routingType === 'SPECIFIC') {
                            tDeptId = targetNode.data.targetDepartmentId ? parseInt(targetNode.data.targetDepartmentId, 10) : null;
                        } else if (targetNode.data.routingType === 'INITIATOR_DEPT' && doc.submitter_id) {
                            const submitterDeptQuery = await pool.query('SELECT department_id FROM users WHERE id = $1', [doc.submitter_id]);
                            tDeptId = submitterDeptQuery.rows[0]?.department_id || null;
                        }

                        let lbQuery = `
                            SELECT u.id, COUNT(d.id) as pending_count 
                            FROM users u
                            LEFT JOIN documents d ON d.current_assignee_id = u.id AND d.status = 'Pending'
                            WHERE u.role_id = $1 AND u.is_active = true
                        `;
                        const lbParams = [tRoleId];
                        if (tDeptId) {
                            lbQuery += ` AND u.department_id = $2`;
                            lbParams.push(tDeptId);
                        }
                        lbQuery += ` GROUP BY u.id ORDER BY pending_count ASC LIMIT 1`;
                        
                        const lbResult = await pool.query(lbQuery, lbParams);
                        if (lbResult.rows.length > 0) {
                            nextAssigneeId = lbResult.rows[0].id;
                            nextRoleId = null;
                            nextDepartmentId = null;
                        } else {
                            nextRoleId = tRoleId;
                            nextDepartmentId = tDeptId;
                        }
                    } else {
                        nextAssigneeId = targetNode.data?.assignee ? parseInt(targetNode.data.assignee, 10) : null;
                    }
                    isFinalStep = false;
                    break;
                }
            }
        }

        // Save Route State & Trigger Stamp
        if (parallelBranches) {
            // Fan out: set document to point at the parallel node, store all branch data
            const parallelNodeId = parallelBranches[0].parallelNodeId;
            await pool.query(
                'UPDATE documents SET current_node_id = $1, current_assignee_id = NULL, current_role_id = NULL, current_department_id = NULL, parallel_branch_data = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
                [parallelNodeId, JSON.stringify(parallelBranches), documentId]
            );
            // Notify all parallel assignees at once (Emails to role-pools isn't trivial, so we stick to explicit assignees for emails here)
            for (const branch of parallelBranches) {
                if (branch.assigneeId) {
                    await sendNotificationEmail(
                        branch.assigneeId,
                        'Parallel Review Required',
                        `A document <b>"${doc.title}"</b> requires your parallel review. All assigned reviewers must approve before the workflow continues.`
                    );
                }
            }
            console.log(`⑂ PARALLEL SPLIT — Fanned out to ${parallelBranches.length} branches`);

        } else if (isFinalStep) {
            await pool.query(
                "UPDATE documents SET status = 'Approved', current_node_id = NULL, current_assignee_id = NULL, current_role_id = NULL, current_department_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
                [documentId]
            );

            // FEATURE 2: Fulfill any dependent workflows where THIS document is required
            await pool.query(
                `UPDATE document_prerequisites dp
                 SET fulfilled_by_document_id = $1, fulfilled_at = CURRENT_TIMESTAMP 
                 FROM documents d
                 WHERE dp.required_workflow_id = $2 
                 AND dp.fulfilled_by_document_id IS NULL
                 AND dp.parent_document_id = d.id 
                 AND d.submitter_id = $3`,
                [documentId, doc.workflow_id, doc.submitter_id]
            );

            await sendNotificationEmail(
                doc.submitter_id,
                'Document Fully Approved!',
                `Great news! Your document <b>"${doc.title}"</b> has passed all review stages.`
            );
            await insertNotification(
                doc.submitter_id,
                `✅ Approved: "${doc.title}"`,
                'Your submission has completed all review stages successfully.',
                'success',
                documentId
            );

        } else {
            await pool.query(
                "UPDATE documents SET current_node_id = $1, current_assignee_id = $2, current_role_id = $3, current_department_id = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5",
                [nextNodeId, nextAssigneeId, nextRoleId, nextDepartmentId, documentId]
            );
            if (nextAssigneeId) {
                await sendNotificationEmail(
                    nextAssigneeId,
                    'New Document Ready for Review',
                    `A new document <b>"${doc.title}"</b> has been routed to your queue.`
                );
            }
        }

        const nodeLogLabel = doc.current_node_id || 'System';
        
        // Create HMAC signature for main workflow approval
        const SIGNING_SECRET = process.env.APPROVAL_SIGNING_SECRET || 'default_secret';
        const docBuffer = fs.readFileSync(doc.file_path);
        const documentHash = crypto.createHash('sha256').update(docBuffer).digest('hex');
        
        const prevApproval = await pool.query(
            'SELECT id, approval_signature, document_hash, approver_id, created_at FROM approvals WHERE document_id = $1 ORDER BY id DESC LIMIT 1',
            [documentId]
        );
        const prev = prevApproval.rows[0];
        
        const approvalDate = new Date();
        const dataToSign = `${documentHash}|${req.user.id}|${approvalDate.toISOString()}`;
        const approvalSignature = crypto.createHmac('sha256', SIGNING_SECRET).update(dataToSign).digest('hex');
        
        let previousApprovalHash = null;
        if (prev) {
            const prevData = `${prev.document_hash}|${prev.approver_id}|${prev.approval_signature}`;
            previousApprovalHash = crypto.createHash('sha256').update(prevData).digest('hex');
        }

        await pool.query(
            "INSERT INTO approvals (document_id, approver_id, node_id, status, comments, document_hash, approval_signature, previous_approval_id, previous_approval_hash, created_at, signature_drawing) VALUES ($1, $2, $3, 'Approved', $4, $5, $6, $7, $8, $9, $10)",
            [documentId, req.user.id, nodeLogLabel, comments || 'Verified by 2FA', documentHash, approvalSignature, prev?.id || null, previousApprovalHash, approvalDate, signatureDrawing || null]
        );

        const auditMessage = isFinalStep
            ? 'Document fully Approved via 2FA'
            : `Document Approved - Routed automatically to next step`;
        await pool.query(
            "INSERT INTO audit_logs (document_id, user_id, action) VALUES ($1, $2, $3)",
            [documentId, req.user.id, auditMessage]
        );

        await pool.query('COMMIT');
        otpStore.delete(req.user.id);
        
        if (isFinalStep) {
            // Append the Approval Certificate page (or image watermark for images)
            await appendSignatureCertificate(doc.file_path, documentId, doc.title, pool);
        }

        res.status(200).json({
            message: isFinalStep
                ? 'Document securely approved'
                : 'Document dynamically routed to next reviewer'
        });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
});

// POST: Reject a document
router.post('/reject', authenticateToken, async (req, res) => {
    const { documentId, comments } = req.body;
    if (!comments || comments.trim() === '') return res.status(400).json({ message: 'A rejection reason is required' });

    try {
        await pool.query('BEGIN');
        await pool.query("UPDATE documents SET status = 'Rejected', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [documentId]);

        const docQuery = await pool.query('SELECT title, submitter_id, current_node_id FROM documents WHERE id = $1', [documentId]);
        const doc = docQuery.rows[0];

        await pool.query("INSERT INTO approvals (document_id, approver_id, node_id, status, comments) VALUES ($1, $2, $3, 'Rejected', $4)", [documentId, req.user.id, doc.current_node_id || 'System', comments]);
        await pool.query("INSERT INTO audit_logs (document_id, user_id, action) VALUES ($1, $2, 'Document Rejected - Revision Required')", [documentId, req.user.id]);

        await pool.query('COMMIT');

        await sendNotificationEmail(
            doc.submitter_id,
            'Action Required: Document Rejected',
            `Your document <b>"${doc.title}"</b> requires your attention.<br><br><b>Feedback:</b> ${comments}<br><br>Please use the "Fix & Resubmit" button on your dashboard to upload a corrected version.`
        );
        await insertNotification(
            doc.submitter_id,
            `❌ Rejected: "${doc.title}"`,
            `Your submission was rejected. Reason: ${comments}. Please fix and resubmit.`,
            'danger',
            documentId
        );

        res.status(200).json({ message: 'Document rejected successfully' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Database error during rejection' });
    }
});

module.exports = router;