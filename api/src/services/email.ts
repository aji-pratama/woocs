import nodemailer from 'nodemailer';
import { ENV } from '../config/env';

export class EmailService {
  private static transporter: nodemailer.Transporter | null = null;

  private static getTransporter() {
    if (!this.transporter) {
      if (!ENV.SMTP_HOST || !ENV.SMTP_USER || !ENV.SMTP_PASS) {
        console.warn('SMTP configuration is missing. Emails will not be sent.');
        return null;
      }
      this.transporter = nodemailer.createTransport({
        host: ENV.SMTP_HOST,
        port: ENV.SMTP_PORT || 587,
        secure: (ENV.SMTP_PORT === 465),
        auth: {
          user: ENV.SMTP_USER,
          pass: ENV.SMTP_PASS,
        },
      });
    }
    return this.transporter;
  }

  static async sendEscalationEmail(
    storeName: string,
    merchantEmail: string | null,
    customerEmail: string,
    customerName: string | undefined,
    message: string,
    sessionId: string
  ) {
    const transporter = this.getTransporter();
    if (!transporter) {
      console.log(`[EmailService] Escalation email simulation for ${storeName} to ${merchantEmail || 'unknown'}`);
      console.log(`From: ${customerEmail} | Message: ${message}`);
      return; // Simulated success in development if no SMTP
    }

    if (!merchantEmail) {
      console.warn(`[EmailService] Cannot send escalation email for ${storeName}, merchant email is missing.`);
      return;
    }

    const mailOptions = {
      from: `"WooCS.ai Assistant" <${ENV.SMTP_USER}>`,
      to: merchantEmail,
      replyTo: customerEmail,
      subject: `[Support Request] New message from ${customerName || customerEmail} on ${storeName}`,
      text: `Store: ${storeName}
Customer Name: ${customerName || 'Unknown'}
Customer Email: ${customerEmail}
Session ID: ${sessionId}

Message:
${message}
`,
      html: `
        <h3>New Support Request from ${storeName}</h3>
        <p><strong>Customer Name:</strong> ${customerName || 'Unknown'}</p>
        <p><strong>Customer Email:</strong> ${customerEmail}</p>
        <p><strong>Session ID:</strong> ${sessionId}</p>
        <hr />
        <h4>Message:</h4>
        <p>${message.replace(/\n/g, '<br/>')}</p>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (err) {
      console.error('[EmailService] Failed to send escalation email:', err);
      throw err;
    }
  }
}
