/**
 * Normalize Meta Middleware
 * 
 * Converts meta.agreementSource="new_flow" to "in_app" for backward compatibility
 * while preserving the original value in the note field.
 */
export const normalizeMeta = (req, res, next) => {
  try {
    // Check if meta exists and has agreementSource
    if (req.body.meta && req.body.meta.agreementSource === 'new_flow') {
      // Convert to in_app
      req.body.meta.agreementSource = 'in_app';
      
      // Append original value to note
      const originalNote = req.body.meta.agreementNote || '';
      req.body.meta.agreementNote = originalNote 
        ? `${originalNote} (original: new_flow)` 
        : '(original: new_flow)';
      
      console.log('[normalizeMeta] Converted new_flow to in_app with note');
    }
    
    next();
  } catch (error) {
    console.error('[normalizeMeta] Error normalizing meta:', error);
    next(); // Continue even if normalization fails
  }
};
