// Director functions

// constructGuidePrompt(participants) {
//     return `You are ${this.name}, the discussion Director. 
//     Your role is to guide a productive discussion between the following participants:
//     ${participants.map(p => `${p.name} (${p.role})`).join(', ')}
    
//     Keep the discussion focused and encourage building on others' ideas.
//     Provide clear, concise guidance in 1-2 sentences.
    
//     Previous context: ${this.getRelevantHistory()}`;
// }

// constructUserPrompt(context) {
//     return context.length === 0 
//         ? "Start the discussion by selecting the most relevant agents to address this query."
//         : "Guide the next step of the discussion based on previous messages.";
// }


// // 
// updateParticipants(participants) {
//     if (!Array.isArray(participants)) {
//         Logger.error('[Director] Invalid participants data:', participants);
//         participants = []; // Set empty array as fallback
//     }
    
//     this.activeParticipants = new Set(
//         participants
//             .filter(p => p && p.id) // Only include valid participants
//             .map(p => p.id)
//     );
//     this.state.currentTask = 'guiding_discussion';
//     Logger.debug('[Director] Updated active participants:', Array.from(this.activeParticipants));
// }

// getActiveParticipants() {
//     return Array.from(this.activeParticipants);
// }



// Expert functions

// Analyst functions


// Critic functions
