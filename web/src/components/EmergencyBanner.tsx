/**
 * Shown when someone's words contain an emergency red flag (screened on the server with the assistant's regex).
 * Live region (role="alert"), deliberately not focus-stealing because it can appear while the person is typing.
 * Fixed wording only: call 000, Lifeline for self-harm, Healthdirect otherwise. Nothing is assessed.
 */
export function EmergencyBanner({ selfHarm, onAcknowledge, acknowledged }: { selfHarm: boolean; onAcknowledge?: () => void; acknowledged?: boolean }) {
  return (
    <div className={`fc-emergency${acknowledged ? " is-ack" : ""}`} role="alert" aria-labelledby="fc-emergency-h">
      <h2 id="fc-emergency-h">{selfHarm ? "You don't have to go through this alone" : "This could be an emergency"}</h2>
      <p>
        {selfHarm
          ? "If you're in immediate danger, call 000 now. You can talk to Lifeline any time, day or night."
          : "If you or someone else is in danger, or has chest pain, trouble breathing, signs of a stroke or severe bleeding, call 000 now. Don't wait for an appointment."}
      </p>
      <div className="fc-emergency-actions">
        <a className="btn fc-call" href="tel:000">Call 000</a>
        {selfHarm && <a className="btn" href="tel:131114">Call Lifeline 13 11 14</a>}
        <a className="btn ghost" href="tel:1800022222">Healthdirect 1800 022 222</a>
      </div>
      <p className="fc-fine">CarePath can't assess symptoms or urgency.</p>
      {onAcknowledge && !acknowledged && (
        <button type="button" className="btn sm fc-ack" onClick={onAcknowledge}>
          I'm safe and it isn't an emergency, continue
        </button>
      )}
    </div>
  );
}
