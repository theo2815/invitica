function normalizeMessageValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildGeneralInvitationMessage(eventTitle: string, invitationUrl: string): string {
  const title = normalizeMessageValue(eventTitle);
  return `You're invited to ${title}.\n\nView the invitation here:\n${invitationUrl}`;
}

export function buildPersonalInvitationMessage(
  eventTitle: string,
  recipientName: string,
  invitationUrl: string,
): string {
  const title = normalizeMessageValue(eventTitle);
  const recipient = normalizeMessageValue(recipientName);
  return `Hi ${recipient}! You're invited to ${title}.\n\nView your personal invitation and RSVP here:\n${invitationUrl}`;
}
