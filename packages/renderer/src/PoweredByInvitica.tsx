/**
 * Platform attribution shown at the foot of a published invitation. Deliberately plain text rather
 * than a link: the guest page should not offer a path away from the invitation, and an outbound
 * anchor would put a third-party destination inside a surface guests reach through a private link.
 *
 * Only structural rules live here. Each template family colours and sizes it from its own
 * stylesheet so the mark reads as part of that family's stationery.
 */
export function PoweredByInvitica() {
  return (
    <p className="iv-powered">
      Powered by <span>Invitica</span>
    </p>
  );
}

export const poweredByInviticaStyles = `
.iv-powered {
  margin: 0;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.iv-powered span {
  font-weight: 700;
}
`;
