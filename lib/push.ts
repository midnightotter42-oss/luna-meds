import webpush from 'web-push';
import {
  getAllPushSubscriptions,
  deletePushSubscription,
  hasPushBeenSent,
  recordPushSent,
} from './db';

let _configured = false;

function configure(): void {
  if (_configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys ontbreken (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)');
  }
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:luna@example.com';
  webpush.setVapidDetails(subject, publicKey, privateKey);
  _configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  bracket?: string;
}

export interface SendBracketPushInput {
  date: string;
  bracket: string;
  triggerType: string;
  payload: PushPayload;
}

export interface SendBracketPushResult {
  sent: boolean;
  reason?: string;
  delivered?: number;
  failed?: number;
  expired?: number;
}

export async function sendBracketPush(
  input: SendBracketPushInput,
): Promise<SendBracketPushResult> {
  if (await hasPushBeenSent(input.date, input.bracket, input.triggerType)) {
    return { sent: false, reason: 'al verstuurd' };
  }

  configure();

  const subs = await getAllPushSubscriptions();
  if (subs.length === 0) {
    return { sent: false, reason: 'geen subscriptions' };
  }

  const claimed = await recordPushSent(input.date, input.bracket, input.triggerType);
  if (!claimed) {
    return { sent: false, reason: 'al verstuurd (race)' };
  }

  const payloadStr = JSON.stringify(input.payload);
  let delivered = 0;
  let failed = 0;
  let expired = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payloadStr,
        );
        delivered++;
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await deletePushSubscription(s.endpoint).catch(() => undefined);
          expired++;
        } else {
          failed++;
        }
      }
    }),
  );

  return { sent: true, delivered, failed, expired };
}
