import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import ejs from 'ejs';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

// ─────────────────────────────────────────────────────────────────────────────
// Production-grade Email Service (Nodemailer + EJS)
//
// Features:
//  • Connection pooling (`pool: true`)
//  • Safe template compilation with layout wrapper
//  • Automatic fallback path resolution for both dev (ts-node) and prod (dist)
//  • Non-crashing graceful error logging
// ─────────────────────────────────────────────────────────────────────────────

export interface SendEmailOptions<T = Record<string, unknown>> {
  to: string;
  subject: string;
  template: 'otp-verification' | 'welcome' | string;
  data: T;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function resolveTemplatesDir(): string {
  const possiblePaths = [
    path.join(__dirname, '../templates/emails'),
    path.join(process.cwd(), 'src/templates/emails'),
    path.join(process.cwd(), 'dist/templates/emails'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return path.join(process.cwd(), 'src/templates/emails');
}

class EmailService {
  private transporter: Transporter;
  private templatesDir: string;

  constructor() {
    this.templatesDir = resolveTemplatesDir();

    this.transporter = nodemailer.createTransport({
      pool: true,
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
      maxConnections: 5,
      maxMessages: 100,
    });

    if (!config.isTest && config.smtp.user && config.smtp.pass) {
      this.transporter.verify((error) => {
        if (error) {
          console.warn('⚠️ [EmailService] SMTP verification warning:', error.message);
        } else {
          console.log('✅ [EmailService] SMTP Transporter ready');
        }
      });
    }
  }

  /**
   * Render an EJS template wrapped in layout.ejs
   */
  public async renderTemplate<T extends Record<string, unknown>>(
    templateName: string,
    data: T,
    subject: string,
  ): Promise<string> {
    const templateFileName = templateName.endsWith('.ejs') ? templateName : `${templateName}.ejs`;
    const templatePath = path.join(this.templatesDir, templateFileName);
    const layoutPath = path.join(this.templatesDir, 'layout.ejs');

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Email template not found: ${templatePath}`);
    }

    const templateContent = await fs.promises.readFile(templatePath, 'utf-8');
    const innerHtml = ejs.render(templateContent, data, { filename: templatePath });

    if (fs.existsSync(layoutPath)) {
      const layoutContent = await fs.promises.readFile(layoutPath, 'utf-8');
      return ejs.render(
        layoutContent,
        { ...data, body: innerHtml, subject },
        { filename: layoutPath },
      );
    }

    return innerHtml;
  }

  /**
   * Send an email with compiled EJS template safely
   */
  public async sendEmail<T extends Record<string, unknown>>(
    options: SendEmailOptions<T>,
  ): Promise<EmailResult> {
    try {
      const html = await this.renderTemplate(options.template, options.data, options.subject);

      const fromAddress = config.smtp.fromAddress || 'noreply@deligo.com';
      const fromName = config.smtp.fromName || 'Deligo Ride';
      const from = `"${fromName}" <${fromAddress}>`;

      // In local dev without credentials, gracefully log instead of failing
      if (!config.smtp.user || !config.smtp.pass) {
        console.log(`[EmailService DEV FALLBACK] → To: ${options.to} | Subject: ${options.subject}`);
        console.log(`[EmailService DEV Content preview]: Template: ${options.template}, Data:`, options.data);
        return { success: true, messageId: 'dev-mock-id' };
      }

      const info = await this.transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        html,
      });

      console.info(`[EmailService] ✅ Email sent to ${options.to} (MessageId: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(
        `[EmailService] ❌ Failed to send email to ${options.to} [template=${options.template}]:`,
        errorMessage,
      );
      return { success: false, error: errorMessage };
    }
  }
}

export const emailService = new EmailService();

export async function sendEmail<T extends Record<string, unknown>>(
  options: SendEmailOptions<T>,
): Promise<EmailResult> {
  return emailService.sendEmail(options);
}
