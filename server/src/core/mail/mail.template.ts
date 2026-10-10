const APP_NAME = 'Dashboard';

/** Copy for one transactional email; `note` is optional. */
export interface MailContent {
  heading: string;
  intro: string;
  buttonLabel: string;
  url: string;
  note?: string;
  footer: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Render a branded card layout with inline CSS only and fluid width (max 560px) so it fits narrow screens. */
export function renderHtml({ heading, intro, buttonLabel, url, note, footer }: MailContent): string {
  const noteHtml = note
    ? `<p style="margin:24px 0 0;font-size:14px;line-height:20px;color:#6b7280;">${escapeHtml(note)}</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;font-size:20px;font-weight:700;color:#4f46e5;">${APP_NAME}</td></tr>
<tr><td style="padding:32px;color:#111827;">
<h1 style="margin:0 0 16px;font-size:24px;line-height:32px;font-weight:700;color:#111827;">${escapeHtml(heading)}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#374151;">${escapeHtml(intro)}</p>
<a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;background-color:#4f46e5;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:6px;">${escapeHtml(buttonLabel)}</a>
${noteHtml}
<p style="margin:24px 0 0;font-size:13px;line-height:20px;color:#6b7280;">Button not working? Copy this link into your browser:<br><span style="word-break:break-all;">${escapeHtml(url)}</span></p>
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #e5e7eb;font-size:12px;line-height:18px;color:#9ca3af;">${escapeHtml(footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Render the plain-text alternative of {@link renderHtml}. */
export function renderText({ heading, intro, url, note, footer }: MailContent): string {
  return [heading, '', intro, url, ...(note ? ['', note] : []), '', footer].join('\n');
}
