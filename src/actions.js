/** Group and cue pickers. In expression mode the expression may return the name or the id. */
export function groupOption(groups) {
	return {
		type: 'dropdown',
		id: 'group',
		label: 'Group',
		choices: groups,
		default: groups[0]?.id ?? '',
		allowInvalidValues: true,
		expressionDescription:
			'The expression must return the screen group’s name exactly as shown in ShowSign (any case), or its ShowSign id.',
	}
}

export function cueOption(cues) {
	return {
		type: 'dropdown',
		id: 'cue',
		label: 'Cue',
		choices: cues,
		default: cues[0]?.id ?? '',
		allowInvalidValues: true,
		expressionDescription:
			'The expression must return the cue’s name exactly as shown in ShowSign (any case), or its ShowSign id.',
	}
}

export function updateActions(self) {
	const groups = self.groupChoices()
	const cues = self.cueChoices()

	self.setActionDefinitions({
		fire: {
			name: 'Fire cue on group',
			description: 'Show a cue on every display in a screen group.',
			options: [
				groupOption(groups),
				cueOption(cues),
				{
					type: 'number',
					id: 'ttl',
					label: 'Auto-clear after (seconds, 0 = stay up)',
					default: 0,
					min: 0,
					max: 86400,
				},
			],
			callback: async ({ options }) => {
				await self.fireCue(options.group, options.cue, Number(options.ttl) || 0)
			},
		},
		clear: {
			name: 'Clear group',
			description: 'Remove the current announcement from every display in a screen group.',
			options: [groupOption(groups)],
			callback: async ({ options }) => {
				await self.clearGroup(options.group)
			},
		},
	})
}
