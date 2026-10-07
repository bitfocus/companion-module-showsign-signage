export function updateActions(self) {
	const groups = self.groupChoices()
	const cues = self.cueChoices()

	self.setActionDefinitions({
		fire: {
			name: 'Fire cue on group',
			description: 'Show a cue on every display in a screen group.',
			options: [
				{ type: 'dropdown', id: 'group', label: 'Group', choices: groups, default: groups[0]?.id ?? '' },
				{ type: 'dropdown', id: 'cue', label: 'Cue', choices: cues, default: cues[0]?.id ?? '' },
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
			options: [{ type: 'dropdown', id: 'group', label: 'Group', choices: groups, default: groups[0]?.id ?? '' }],
			callback: async ({ options }) => {
				await self.clearGroup(options.group)
			},
		},
	})
}
