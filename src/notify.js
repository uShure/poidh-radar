// Telegram delivery. Credentials come from the environment, never from the repo.

const API = 'https://api.telegram.org';

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatBounty(bounty) {
  const parts = [
    `<b>${escapeHtml(bounty.title ?? 'untitled')}</b>`,
    `$${bounty.usd.toFixed(0)} · ${bounty.chain} · ${bounty.claimCount} claim(s)` +
      (bounty.ageDays === null ? '' : ` · ${bounty.ageDays}d old`),
  ];
  if (bounty.tags.length) parts.push(escapeHtml(bounty.tags.join(', ')));
  const summary = (bounty.description ?? '').replace(/\s+/g, ' ').slice(0, 200);
  if (summary) parts.push(escapeHtml(summary));
  parts.push(bounty.url);
  return parts.join('\n');
}

export function hasCredentials(env = process.env) {
  return Boolean(env.POIDH_RADAR_TG_TOKEN && env.POIDH_RADAR_TG_CHAT);
}

export async function sendTelegram(text, env = process.env) {
  const token = env.POIDH_RADAR_TG_TOKEN;
  const chatId = env.POIDH_RADAR_TG_CHAT;
  if (!token || !chatId) throw new Error('POIDH_RADAR_TG_TOKEN and POIDH_RADAR_TG_CHAT must be set');

  const res = await fetch(`${API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(`telegram: ${body.description ?? res.status}`);
  }
  return body;
}
