import nodemailer from 'nodemailer';
import type { Medication } from './types';

let _transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (_transporter) return _transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_PASSWORD;
  if (!user || !pass) {
    throw new Error('GMAIL_USER en GMAIL_PASSWORD moeten gezet zijn in .env');
  }
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return _transporter;
}

export type ReminderTier = 'gentle' | 'serious';

export interface ReminderContext {
  tier: ReminderTier;
  missedToday: Medication[];
  consecutiveMissedDays: number;
}

function renderSubject(tier: ReminderTier): string {
  switch (tier) {
    case 'gentle':
      return '💛 Hoi Luna, je hebt twee dagen je medicatie gemist';
    case 'serious':
      return '❤️ Luna, neem alsjeblieft je medicatie';
  }
}

function renderBody(ctx: ReminderContext): string {
  const list = ctx.missedToday
    .map((m) => `• ${m.name} (${m.time})${m.notes ? ` — ${m.notes}` : ''}`)
    .join('\n');

  switch (ctx.tier) {
    case 'gentle':
      return `Hoi Luna,

Je hebt nu twee dagen op rij medicatie gemist. Dat kan invloed hebben op je hormonen en hoe je je voelt.

Vandaag nog te doen:
${list}

Probeer het vandaag wel te nemen — voor jezelf 💛

Lukt het niet? Stel een wekker, of vraag iemand om je te helpen herinneren.

Luna app 💙`;

    case 'serious':
      return `Lieve Luna,

Dit is een dringende reminder. Je hebt ${ctx.consecutiveMissedDays} dagen op rij medicatie gemist.

Vandaag nog te doen:
${list}

Dit gaat over jouw gezondheid. Pak alsjeblieft je medicatie en maak een foto in de app.

Als je merkt dat het structureel niet lukt, overweeg dan om contact op te nemen met je arts of iemand om je heen om je te helpen ❤️

Luna app 💙`;
  }
}

export async function sendReminderEmail(ctx: ReminderContext): Promise<void> {
  const to = process.env.LUNA_EMAIL;
  if (!to) throw new Error('LUNA_EMAIL niet gezet in .env');
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"Luna app 💊" <${process.env.GMAIL_USER}>`,
    to,
    subject: renderSubject(ctx.tier),
    text: renderBody(ctx),
  });
}
