/** Variable ids may only contain letters, numbers and underscores. */
function groupVarId(groupId) {
	return `group_${String(groupId).replace(/[^a-zA-Z0-9]/g, '_')}_cue`
}

export function updateVariableDefinitions(self) {
	const defs = {
		event_name: { name: 'Event name' },
		last_action_error: { name: 'Last Fire/Clear error (blank after a successful press)' },
	}
	for (const g of self.context.groups) {
		defs[groupVarId(g.id)] = { name: `Live cue — ${g.name}` }
	}
	self.setVariableDefinitions(defs)
}

export function updateVariableValues(self) {
	const values = {
		event_name: self.context.event?.name ?? '',
		last_action_error: self.lastActionError ?? '',
	}
	for (const g of self.context.groups) {
		const live = self.context.active.find((a) => a.groupId === g.id)
		values[groupVarId(g.id)] = live ? live.label || 'live' : ''
	}
	self.setVariableValues(values)
}
