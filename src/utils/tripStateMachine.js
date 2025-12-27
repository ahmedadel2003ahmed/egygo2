/**
 * Trip State Machine Definition
 * Defines all allowed states and valid transitions for the Trip lifecycle.
 */

export const TRIP_STATES = {
  DRAFT: 'draft',
  SELECTING_GUIDE: 'selecting_guide',
  AWAITING_CALL: 'awaiting_call',
  IN_CALL: 'in_call',
  PENDING_CONFIRMATION: 'pending_confirmation',
  AWAITING_PAYMENT: 'awaiting_payment',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
  ARCHIVED: 'archived'
};

const TRANSITIONS = {
  [TRIP_STATES.DRAFT]: [TRIP_STATES.SELECTING_GUIDE, TRIP_STATES.CANCELLED],
  [TRIP_STATES.SELECTING_GUIDE]: [
    TRIP_STATES.AWAITING_CALL, // Quando guida selezionata
    TRIP_STATES.CANCELLED
  ],
  [TRIP_STATES.AWAITING_CALL]: [
    TRIP_STATES.IN_CALL,      // Quando inizia la chiamata
    TRIP_STATES.SELECTING_GUIDE, // Utente cambia guida (backtrack)
    TRIP_STATES.CANCELLED
  ],
  [TRIP_STATES.IN_CALL]: [
    TRIP_STATES.PENDING_CONFIRMATION, // Chiamata finita
    TRIP_STATES.AWAITING_CALL, // Errore connessione, riprova
    TRIP_STATES.AWAITING_PAYMENT, // Allow direct accept if call logic skipped
    TRIP_STATES.CANCELLED
  ],
  [TRIP_STATES.PENDING_CONFIRMATION]: [
    TRIP_STATES.AWAITING_PAYMENT, // Guida accetta
    TRIP_STATES.REJECTED,        // Guida rifiuta
    TRIP_STATES.AWAITING_CALL,   // Rinegoziazione (nuova chiamata)
    TRIP_STATES.CANCELLED
  ],
  [TRIP_STATES.AWAITING_PAYMENT]: [
    TRIP_STATES.CONFIRMED, // Pagamento OK
    TRIP_STATES.PENDING_CONFIRMATION, // Backtrack? Usually no, but maybe timeout
    TRIP_STATES.CANCELLED
  ],
  [TRIP_STATES.CONFIRMED]: [
    TRIP_STATES.IN_PROGRESS,
    TRIP_STATES.CANCELLED,
    TRIP_STATES.COMPLETED // Immediate completion for short trips?
  ],
  [TRIP_STATES.IN_PROGRESS]: [
    TRIP_STATES.COMPLETED,
    TRIP_STATES.CANCELLED // Emergency cancel
  ],
  [TRIP_STATES.REJECTED]: [
    TRIP_STATES.SELECTING_GUIDE, // Riprova con altra guida
    TRIP_STATES.ARCHIVED
  ],
  [TRIP_STATES.CANCELLED]: [
    TRIP_STATES.ARCHIVED
  ],
  [TRIP_STATES.COMPLETED]: [
    TRIP_STATES.ARCHIVED
  ],
  [TRIP_STATES.ARCHIVED]: [] // Terminal state
};

/**
 * Validates if a state transition is allowed
 * @param {string} fromState - Current state
 * @param {string} toState - Target state
 * @returns {boolean} true if allowed
 */
export const canTransition = (fromState, toState) => {
  if (!fromState || !toState) return false;
  const allowed = TRANSITIONS[fromState];
  return allowed ? allowed.includes(toState) : false;
};

/**
 * Throws error if transition is invalid
 * @param {string} fromState 
 * @param {string} toState 
 * @throws {Error}
 */
export const validateTransition = (fromState, toState) => {
  if (!canTransition(fromState, toState)) {
    throw new Error(`Invalid trip state transition from '${fromState}' to '${toState}'`);
  }
};
