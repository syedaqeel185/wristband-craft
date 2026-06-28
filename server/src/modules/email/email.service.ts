import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

const SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };

interface OrderInfo {
  id: string;
  quantity: number;
  totalPrice: number;
  currency?: string | null;
  wristbandType?: string | null;
}

interface ShipmentInfo {
  courier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  estimatedDelivery?: string | Date | null;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly from = process.env.EMAIL_FROM || 'EU Wristbands <no-reply@euwristbands.com>';
  private transporterPromise: Promise<nodemailer.Transporter> | null = null;
  private usingEthereal = false;

  /**
   * Lazily build a nodemailer transport. Configure any provider via SMTP_* env
   * vars (Gmail, your own domain, Brevo/Mailgun/SES relays, …). With no SMTP
   * config we fall back to an Ethereal test inbox in dev — mail isn't delivered
   * but a preview URL is logged, so the flow is fully testable without creds.
   */
  private getTransporter(): Promise<nodemailer.Transporter> {
    if (this.transporterPromise) return this.transporterPromise;
    this.transporterPromise = (async () => {
      const host = process.env.SMTP_HOST;
      if (host) {
        const port = Number(process.env.SMTP_PORT) || 587;
        return nodemailer.createTransport({
          host,
          port,
          secure: process.env.SMTP_SECURE === 'true' || port === 465,
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
        });
      }
      const test = await nodemailer.createTestAccount();
      this.usingEthereal = true;
      this.logger.warn(
        'SMTP_HOST not set — using Ethereal test inbox. Emails are NOT delivered; preview URLs are logged. Set SMTP_* for real sending.',
      );
      return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: test.user, pass: test.pass },
      });
    })();
    return this.transporterPromise;
  }

  private money(o: OrderInfo) {
    const sym = SYMBOL[(o.currency || 'EUR').toUpperCase()] || '€';
    return `${sym}${Number(o.totalPrice || 0).toFixed(2)}`;
  }

  /** Branded HTML shell. Keeps every email visually consistent. */
  private layout(title: string, bodyHtml: string, cta?: { label: string; url: string }) {
    const button = cta
      ? `<tr><td style="padding:8px 0 4px"><a href="${cta.url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">${cta.label}</a></td></tr>`
      : '';
    return `
  <div style="background:#f3f4f6;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#111827">
    <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
      <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:20px 24px;color:#fff;font-size:18px;font-weight:700">EU Wristbands</td></tr>
      <tr><td style="padding:24px">
        <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
        <table role="presentation" width="100%" style="font-size:14px;line-height:1.6;color:#374151">
          <tr><td>${bodyHtml}</td></tr>
          ${button}
        </table>
      </td></tr>
      <tr><td style="padding:16px 24px;background:#f9fafb;color:#9ca3af;font-size:12px">You received this email because you placed an order with EU Wristbands.</td></tr>
    </table>
  </div>`;
  }

  private orderRows(o: OrderInfo) {
    return `
      <strong>Order #${o.id.slice(0, 8)}</strong><br/>
      Type: ${o.wristbandType || 'wristband'}<br/>
      Quantity: ${o.quantity} pcs<br/>
      Total: ${this.money(o)}`;
  }

  /** Never throw — email failures must not break the order flow. */
  private async send(to: string, subject: string, html: string) {
    try {
      const transporter = await this.getTransporter();
      const info = await transporter.sendMail({ from: this.from, to, subject, html });
      const preview = this.usingEthereal ? nodemailer.getTestMessageUrl(info) : null;
      this.logger.log(`Sent "${subject}" to ${to}${preview ? ` — preview: ${preview}` : ''}`);
    } catch (e) {
      this.logger.error(`Failed to send "${subject}" to ${to}: ${(e as Error).message}`);
    }
  }

  async orderConfirmationRequest(to: string, name: string | null, order: OrderInfo, confirmUrl: string) {
    const html = this.layout(
      'Please confirm your order',
      `Hi ${name || 'there'},<br/><br/>
       We've received payment for your order — thank you! Please review the details below and
       confirm so we can begin production.<br/><br/>
       ${this.orderRows(order)}<br/><br/>
       Once you confirm, production starts and we'll keep you posted on shipping and delivery.`,
      { label: 'Confirm & start production', url: confirmUrl },
    );
    await this.send(to, `Confirm your order #${order.id.slice(0, 8)}`, html);
  }

  async productionStarted(to: string, name: string | null, order: OrderInfo) {
    const html = this.layout(
      'Your order is in production',
      `Hi ${name || 'there'},<br/><br/>
       Thanks for confirming! Your wristbands are now being produced.<br/><br/>
       ${this.orderRows(order)}<br/><br/>
       We'll email you tracking details as soon as your order ships.`,
    );
    await this.send(to, `Order #${order.id.slice(0, 8)} is in production`, html);
  }

  async orderShipped(to: string, name: string | null, order: OrderInfo, shipment: ShipmentInfo) {
    const eta = shipment.estimatedDelivery
      ? new Date(shipment.estimatedDelivery).toLocaleDateString()
      : null;
    const details = `
      ${shipment.courier ? `Courier: ${shipment.courier}<br/>` : ''}
      ${shipment.trackingNumber ? `Tracking #: ${shipment.trackingNumber}<br/>` : ''}
      ${eta ? `Estimated delivery: ${eta}<br/>` : ''}`;
    const cta = shipment.trackingUrl ? { label: 'Track your shipment', url: shipment.trackingUrl } : undefined;
    const html = this.layout(
      'Your order has shipped',
      `Hi ${name || 'there'},<br/><br/>
       Good news — your order is on its way!<br/><br/>
       ${this.orderRows(order)}<br/><br/>
       ${details}`,
      cta,
    );
    await this.send(to, `Order #${order.id.slice(0, 8)} has shipped`, html);
  }

  async orderDelivered(to: string, name: string | null, order: OrderInfo) {
    const html = this.layout(
      'Your order has been delivered',
      `Hi ${name || 'there'},<br/><br/>
       Your order has been marked as delivered. We hope you love your wristbands!<br/><br/>
       ${this.orderRows(order)}`,
    );
    await this.send(to, `Order #${order.id.slice(0, 8)} delivered`, html);
  }

  /** Customer: order accepted (e.g. supplier accepted it directly). */
  async orderAccepted(to: string, name: string | null, order: OrderInfo) {
    const html = this.layout(
      'Your order has been accepted',
      `Hi ${name || 'there'},<br/><br/>
       Your order has been accepted and is being prepared for production.<br/><br/>
       ${this.orderRows(order)}`,
    );
    await this.send(to, `Order #${order.id.slice(0, 8)} accepted`, html);
  }

  // --- Supplier-facing notifications -------------------------------------

  async supplierNewOrder(to: string, company: string | null, order: OrderInfo, customer: string | null) {
    const html = this.layout(
      'New paid order received',
      `Hi ${company || 'there'},<br/><br/>
       You have a new <strong>paid</strong> order awaiting the customer's confirmation.<br/><br/>
       ${this.orderRows(order)}<br/>
       ${customer ? `Customer: ${customer}<br/>` : ''}<br/>
       We'll notify you again the moment the customer confirms so you can begin production.`,
    );
    await this.send(to, `New order #${order.id.slice(0, 8)}`, html);
  }

  async supplierOrderConfirmed(to: string, company: string | null, order: OrderInfo) {
    const html = this.layout(
      'Order confirmed — begin production',
      `Hi ${company || 'there'},<br/><br/>
       The customer has <strong>confirmed</strong> their order. You can start production now.<br/><br/>
       ${this.orderRows(order)}<br/><br/>
       Open your dashboard to manage production and shipping.`,
    );
    await this.send(to, `Order #${order.id.slice(0, 8)} confirmed — start production`, html);
  }
}
